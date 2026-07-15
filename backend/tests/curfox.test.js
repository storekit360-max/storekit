'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSriLankanPhone, resolveDestinationCity, calculatePackageWeight, curfoxCodAmount, applyManualWaybill, canSubmitToCurfox, shouldSyncCurfoxOrder, compactStatusHistory, mergeCourierIntoProcessing, mapCurfoxStatus } = require('../services/curfoxMapping');
const { normalizeProductValue, duplicateWithinTenant } = require('../utils/productDuplicates');
const { assertSafeStagingDatabase } = require('../utils/stagingSafety');
const { encryptSecret, decryptSecret, optionalEncryptedSecret } = require('../utils/secretCrypto');
const { publicConfig, validateConfiguration } = require('../routes/curfox');
const curfoxClient = require('../services/curfoxClient');

test('product comparison trims and ignores case',()=>assert.equal(normalizeProductValue('  My PRODUCT '),'my product'));
test('same normalized product name in one tenant is duplicate',()=>assert.equal(duplicateWithinTenant({tenantId:'a',name:' Item '},{tenantId:'a',name:'item'}),true));
test('same product name in different tenants is allowed',()=>assert.equal(duplicateWithinTenant({tenantId:'a',name:'Item'},{tenantId:'b',name:'item'}),false));
test('same non-empty SKU in one tenant is duplicate',()=>assert.equal(duplicateWithinTenant({tenantId:'a',name:'One',sku:' SKU-1 '},{tenantId:'a',name:'Two',sku:'sku-1'}),true));
test('empty SKUs do not create duplicates',()=>assert.equal(duplicateWithinTenant({tenantId:'a',name:'One',sku:''},{tenantId:'a',name:'Two',sku:' '}),false));
test('phone normalization handles Sri Lankan international forms',()=>{
  assert.equal(normalizeSriLankanPhone('+94771234567'),'0771234567');
  assert.equal(normalizeSriLankanPhone('0094771234567'),'0771234567');
  assert.equal(normalizeSriLankanPhone('94771234567'),'0771234567');
  assert.equal(normalizeSriLankanPhone('+94110000000'),'0110000000');
});
test('invalid phone is rejected',()=>assert.throws(()=>normalizeSriLankanPhone('+94+77123'),/Invalid|Phone/));
test('city resolver uses exact canonical city and its state',()=>{
  const cities=[{id:1,name:'Colombo 01',state:{id:4,name:'Colombo'}}];
  assert.deepEqual(resolveDestinationCity('colombo 01','12 Road, Colombo 01',cities),{city:'Colombo 01',state:'Colombo',cityId:1,stateId:4});
});
test('city resolver does not silently guess ambiguous matches',()=>{
  const cities=[{id:1,name:'Town',state:{id:1,name:'A'}},{id:2,name:'Town',state:{id:2,name:'B'}}];
  assert.equal(resolveDestinationCity('Town','',cities).ambiguous,true);
});
test('weight uses all product weights or configured fallback',()=>{
  assert.equal(calculatePackageWeight([{product:'a',quantity:2}],[{_id:'a',weight:1.5}],1),3);
  assert.equal(calculatePackageWeight([{product:'a',quantity:2}],[],1.25),1.25);
  assert.equal(calculatePackageWeight([],[],1,2.5),2.5);
});
test('manual waybill behavior is covered by omission semantics',()=>{
  const row=applyManualWaybill({order_no:'1'},false,'RA1');assert.equal(Object.hasOwn(row,'waybill_number'),false);assert.equal(applyManualWaybill({},true,'RA1').waybill_number,'RA1');
});
test('COD uses final payable order total',()=>assert.equal(curfoxCodAmount({paymentMethod:'cod',total:1234.5}),1234.5));
test('prepaid orders send zero COD',()=>assert.equal(curfoxCodAmount({paymentMethod:'stripe',total:1234.5}),0));
test('pending Curfox order cannot submit',()=>assert.equal(canSubmitToCurfox({deliveryService:'curfox',orderStatus:'pending'}),false));
test('confirmed and processing Curfox orders can submit',()=>{assert.equal(canSubmitToCurfox({deliveryService:'curfox',orderStatus:'confirmed'}),true);assert.equal(canSubmitToCurfox({deliveryService:'curfox',orderStatus:'processing'}),true);});
test('marking an order shipped does not make it submit eligible',()=>assert.equal(canSubmitToCurfox({deliveryService:'curfox',orderStatus:'shipped'}),false));
test('scheduler selects only submitted real shipped Curfox orders',()=>assert.equal(shouldSyncCurfoxOrder({deliveryService:'curfox',orderStatus:'shipped',courier:{provider:'curfox',submissionState:'submitted',dryRun:false,waybill:'RA1'}}),true));
test('scheduler ignores dry-run and terminal orders',()=>{assert.equal(shouldSyncCurfoxOrder({deliveryService:'curfox',orderStatus:'shipped',courier:{provider:'curfox',submissionState:'submitted',dryRun:true,waybill:'RA1'}}),false);assert.equal(shouldSyncCurfoxOrder({deliveryService:'curfox',orderStatus:'delivered',courier:{provider:'curfox',submissionState:'submitted',dryRun:false,waybill:'RA1'}}),false);});
test('status mapping never regresses shipped to processing',()=>{
  assert.equal(mapCurfoxStatus('SOME ACTIVE STATUS','shipped'),'shipped');
  assert.equal(mapCurfoxStatus('ASSIGNED TO DESTINATION RIDER','shipped'),'out_for_delivery');
  assert.equal(mapCurfoxStatus('PARTIALLY DELIVERED','out_for_delivery'),'out_for_delivery');
  assert.equal(mapCurfoxStatus('DELIVERED','out_for_delivery'),'delivered');
});
test('Curfox cancelled status maps to local cancelled',()=>assert.equal(mapCurfoxStatus('CANCELLED','shipped'),'cancelled'));
test('consecutive status history compacts and preserves unique notes',()=>{
  const rows=compactStatusHistory([{status:'processing',note:'A'},{status:'processing',note:'B'},{status:'shipped',note:'C'},{status:'processing',note:'D'}]);
  assert.equal(rows.length,3);assert.match(rows[0].note,/A/);assert.match(rows[0].note,/B/);
});
test('courier submission merges into latest processing row',()=>{
  const rows=mergeCourierIntoProcessing([{status:'processing',note:'Status updated to processing'}],'Submitted to Curfox. Waybill: RA1');
  assert.equal(rows.length,1);assert.match(rows[0].note,/RA1/);
});
test('Curfox credentials are encrypted and redacted',()=>{
  process.env.CURFOX_ENCRYPTION_KEY='test-only-secret-at-least-twenty-four-characters';
  const encrypted=encryptSecret('merchant-password');assert.equal(decryptSecret(encrypted),'merchant-password');
  const output=publicConfig({enabled:true,encryptedPassword:encrypted});assert.equal(output.hasCredentials,true);assert.equal(JSON.stringify(output).includes('merchant-password'),false);assert.equal(Object.hasOwn(output,'encryptedPassword'),false);
});
test('blank password edit omits encrypted field and preserves saved credential',()=>{assert.deepEqual(optionalEncryptedSecret(''),{});assert.equal(Boolean(optionalEncryptedSecret('new-password').encryptedPassword?.ciphertext),true);});
test('disabled Curfox connection can be saved before selecting a business',()=>assert.doesNotThrow(()=>validateConfiguration({enabled:false,courierTenant:'royalexpress',merchantEmail:'merchant@example.com',password:'secret',defaultPackageWeight:1,initialStatusKey:'key_1'},true)));
test('enabling Curfox still requires business and exact origin',()=>assert.throws(()=>validateConfiguration({enabled:true,courierTenant:'royalexpress',merchantEmail:'merchant@example.com',password:'secret',defaultPackageWeight:1,initialStatusKey:'key_1'},true),/Merchant business is required/));
test('token cache is keyed independently per application tenant',()=>{
  curfoxClient._tokenCache.set('tenant-a:royal:a@example.com',{token:'a'});curfoxClient._tokenCache.set('tenant-b:royal:b@example.com',{token:'b'});
  curfoxClient.clearTenantToken('tenant-a');assert.equal(curfoxClient._tokenCache.has('tenant-a:royal:a@example.com'),false);assert.equal(curfoxClient._tokenCache.get('tenant-b:royal:b@example.com').token,'b');curfoxClient._tokenCache.clear();
});
test('staging guard rejects production-looking database',()=>{
  assert.throws(()=>assertSafeStagingDatabase({APP_ENV:'staging',MONGODB_URI:'mongodb://localhost/shopzen'}),/STAGING SAFETY/);
  assert.equal(assertSafeStagingDatabase({APP_ENV:'staging',MONGODB_URI:'mongodb://localhost/shopzen_staging'}),true);
});
