const mongoose = require('mongoose');
const schema = new mongoose.Schema({ tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true }, sequenceType: { type: String, required: true }, dateKey: { type: String, required: true }, currentValue: { type: Number, default: 0 } }, { timestamps: true });
schema.index({ tenantId: 1, sequenceType: 1, dateKey: 1 }, { unique: true });
module.exports = mongoose.models.TenantSequence || mongoose.model('TenantSequence', schema);
