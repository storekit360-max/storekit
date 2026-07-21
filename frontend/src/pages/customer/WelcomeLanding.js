import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

const safeDestination = value => {
  const url = String(value || '').trim();
  if (/^https?:\/\//i.test(url) || /^\//.test(url)) return url;
  return '/shop';
};

export default function WelcomeLanding() {
  const { settings, visualDark } = useTheme();
  const stores = Array.isArray(settings?.businessWelcomeStores) ? settings.businessWelcomeStores : [];
  const title = settings?.businessWelcomeTitle || `Welcome to ${settings?.storeName || 'our stores'}`;
  const subtitle = settings?.businessWelcomeSubtitle || 'Choose the business you would like to visit.';

  return (
    <section className={`welcome-landing ${visualDark ? 'dark-mode' : ''} min-h-[calc(100vh-72px)] px-4 sm:px-6 py-10 sm:py-16`} style={{background:'var(--body-bg)', color:'var(--text-primary)'}}>
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mx-auto text-center mb-9 sm:mb-12">
          <span className="inline-flex rounded-full px-4 py-2 text-xs sm:text-sm font-bold mb-5" style={{background:'color-mix(in srgb,var(--color-primary) 15%,var(--card-bg))',color:'var(--color-primary-light)'}}>
            {settings?.businessWelcomeEyebrow || 'One brand · Multiple businesses'}
          </span>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black leading-tight" style={{fontFamily:'var(--font-display)',color:'var(--text-primary)'}}>{title}</h1>
          <p className="mt-4 text-base sm:text-lg max-w-2xl mx-auto" style={{color:'var(--text-secondary)'}}>{subtitle}</p>
        </div>

        <div className={`grid gap-5 sm:gap-7 ${stores.length === 1 ? 'max-w-xl mx-auto' : 'md:grid-cols-2'}`}>
          {stores.map((store, index) => {
            const destination = safeDestination(store.url);
            const external = /^https?:\/\//i.test(destination);
            const content = (
              <>
                <div className="aspect-[16/8] sm:aspect-[16/7] overflow-hidden" style={{background:index % 2 ? 'var(--hero-gradient)' : 'var(--theme-gradient)'}}>
                  {store.imageUrl && <img src={store.imageUrl} alt="" className="w-full h-full object-cover"/>}
                </div>
                <div className="p-5 sm:p-7">
                  <h2 className="text-xl sm:text-2xl font-black" style={{fontFamily:'var(--font-display)',color:'var(--text-on-card)'}}>{store.name || `Business ${index + 1}`}</h2>
                  <p className="mt-2 text-sm sm:text-base min-h-[2.75rem]" style={{color:'var(--text-muted-on-card)'}}>{store.description || 'Explore this store and its products.'}</p>
                  <span className="mt-5 inline-flex items-center rounded-xl px-5 py-3 text-sm font-bold text-white" style={{background:'var(--theme-gradient)'}}>{store.buttonLabel || 'Visit store'} →</span>
                </div>
              </>
            );
            const className = 'block overflow-hidden border transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 rounded-[var(--template-card-radius)]';
            const style = {background:'var(--card-bg)',borderColor:'var(--border-color)',boxShadow:'var(--template-card-shadow)'};
            return external
              ? <a key={index} href={destination} className={className} style={style}>{content}</a>
              : <Link key={index} to={destination} className={className} style={style}>{content}</Link>;
          })}
        </div>

        {!stores.length && <div className="max-w-xl mx-auto text-center rounded-2xl p-8 border" style={{background:'var(--card-bg)',borderColor:'var(--border-color)'}}><p style={{color:'var(--text-secondary)'}}>Store destinations have not been configured yet.</p><Link to="/shop" className="btn-primary inline-flex mt-5">Continue to shop</Link></div>}
      </div>
    </section>
  );
}
