// Applies admin-editable settings (brand name, logo, override texts,
// pricing) fetched live from the server. Runs on every page. If the
// server can't be reached, the page just keeps its built-in defaults —
// this is enhancement, never a hard dependency.

async function fetchPublicSettings() {
  try {
    return await apiGet('/settings/public');
  } catch (err) {
    console.warn('Could not load live settings, using page defaults:', err.message);
    return null;
  }
}

function applyBrandSettings(settings) {
  if (!settings) return;

  if (settings.brand_name) {
    document.querySelectorAll('[data-i18n="brand_name"]').forEach(el => { el.textContent = settings.brand_name; });
    // page <title> often has its own data-i18n key (title_home, title_rules, ...)
    // but always ends with "| <brand>" by convention — patch that suffix too.
    if (document.title.includes('|')) {
      document.title = document.title.replace(/\|.*$/, '| ' + settings.brand_name);
    }
  }

  if (settings.logo_svg) {
    document.querySelectorAll('.logo-mark').forEach(el => { el.innerHTML = settings.logo_svg; });
  }

  if (settings.disclaimer_override) {
    document.querySelectorAll('[data-i18n="disclaimer_text"]').forEach(el => { el.textContent = settings.disclaimer_override; });
  }

  if (settings.hero_tagline_override) {
    document.querySelectorAll('[data-i18n="home_h1_1"]').forEach(el => { el.textContent = settings.hero_tagline_override; });
    document.querySelectorAll('[data-i18n="home_h1_2"]').forEach(el => { el.textContent = ''; }); // avoid a stale second line
  }

  if (settings.mission_text_override) {
    document.querySelectorAll('[data-i18n="home_mission"]').forEach(el => { el.textContent = settings.mission_text_override; });
  }

  if (settings.support_email) {
    document.querySelectorAll('.support-email-link').forEach(el => {
      const label = el.querySelector('span');
      if (label) label.textContent = settings.support_email; else el.textContent = settings.support_email;
      el.href = 'mailto:' + settings.support_email;
      el.style.display = 'flex';
    });
  }
  if (settings.support_telegram) {
    document.querySelectorAll('.support-telegram-link').forEach(el => {
      const label = el.querySelector('span');
      if (label) label.textContent = settings.support_telegram; else el.textContent = settings.support_telegram;
      el.href = 'https://t.me/' + settings.support_telegram.replace(/^@/, '');
      el.style.display = 'flex';
    });
  }

  if (settings.model_config) {
    document.querySelectorAll('.model-key-terms').forEach(el => {
      const cfg = settings.model_config[el.dataset.model];
      if (!cfg) return;
      const isFa = (localStorage.getItem('fbb_lang') || 'fa') === 'fa';
      const pct = (n) => Math.round(n * 1000) / 10; // 0.075 -> 7.5, cleanly
      el.textContent = isFa
        ? `هدف سود ${pct(cfg.profit_target_pct)}٪ · حداکثر ضرر روزانه ${pct(cfg.max_daily_loss_pct)}٪ · حداکثر ضرر کل ${pct(cfg.max_total_loss_pct)}٪ · سهم سود ${pct(cfg.profit_split_pct)}٪`
        : `${pct(cfg.profit_target_pct)}% profit target · ${pct(cfg.max_daily_loss_pct)}% max daily loss · ${pct(cfg.max_total_loss_pct)}% max total loss · ${pct(cfg.profit_split_pct)}% profit split`;
    });
  }

  // Keep the account-caps marketing copy honest — these are admin-editable
  // settings, but the text was previously frozen at whatever numbers were
  // hardcoded into the translation dictionary, which could silently go
  // stale (or actively misleading) the moment an admin changed the caps.
  if (settings.caps) {
    const capsEl = document.querySelector('[data-i18n="home_plans_desc"]');
    if (capsEl) {
      const isFa = (localStorage.getItem('fbb_lang') || 'fa') === 'fa';
      const { max_plan_size, max_funded_total, max_active_accounts } = settings.caps;
      capsEl.textContent = isFa
        ? `حداکثر اندازه هر حساب ${max_plan_size.toLocaleString()} دلاره؛ حداکثر مجموع سرمایه فعال هر تریدر ${max_funded_total.toLocaleString()} دلار (حداکثر ${max_active_accounts} حساب فعال همزمان).`
        : `Maximum size per account is $${max_plan_size.toLocaleString()}; maximum total active capital per trader is $${max_funded_total.toLocaleString()} (max ${max_active_accounts} active accounts at once).`;
    }
  }

  // Live pricing on the homepage plan table — updates both the displayed
  // price and the data-price attribute the "add to cart" buttons read from.
  if (settings.pricing) {
    document.querySelectorAll('.plan-row').forEach(row => {
      const panel = row.closest('.plan-model-panel');
      if (!panel) return;
      const model = panel.dataset.panel;
      const size = row.dataset.size;
      const price = settings.pricing?.[model]?.[size];
      if (price != null) {
        row.dataset.price = price;
        const priceEl = row.querySelector('.price');
        if (priceEl) priceEl.textContent = '$' + price;
      }
    });
  }
}

function applyI18nOverrides(overrides) {
  if (!overrides || typeof I18N === 'undefined') return;
  for (const lang of Object.keys(overrides)) {
    if (!I18N[lang]) continue;
    Object.assign(I18N[lang], overrides[lang]); // merges in, doesn't touch keys the admin left alone
  }
  // re-render every [data-i18n] element on the page with the merged dictionary
  if (typeof applyI18n === 'function') applyI18n(currentLang());
}

function applyTheme(theme) {
  if (!theme) return;
  const c = theme.colors || {};
  const css = `:root{
    ${c.ink ? `--ink:${c.ink};` : ''} ${c.ink2 ? `--ink-2:${c.ink2};` : ''} ${c.ink3 ? `--ink-3:${c.ink3};` : ''}
    ${c.gold ? `--gold:${c.gold};` : ''} ${c.goldSoft ? `--gold-soft:${c.goldSoft};` : ''}
    ${c.teal ? `--teal:${c.teal};` : ''} ${c.tealSoft ? `--teal-soft:${c.tealSoft};` : ''}
    ${c.paper ? `--paper:${c.paper};` : ''} ${c.paperDim ? `--paper-dim:${c.paperDim};` : ''}
    ${c.green ? `--green:${c.green};` : ''} ${c.red ? `--red:${c.red};` : ''}
  }`;
  let styleTag = document.getElementById('fbb-theme-override');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'fbb-theme-override';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = css;

  if (theme.body_font || theme.display_font) {
    const families = [theme.body_font, theme.display_font].filter(Boolean).map(f => f.replace(/ /g, '+'));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`;
    document.head.appendChild(link);
    const fontCss = document.createElement('style');
    fontCss.textContent = `
      ${theme.body_font ? `body{ font-family:'${theme.body_font}', sans-serif; }` : ''}
      ${theme.display_font ? `.cert h1, .price, [class*="Fraunces"]{ font-family:'${theme.display_font}', serif; }` : ''}
    `;
    document.head.appendChild(fontCss);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await fetchPublicSettings();
  applyI18nOverrides(settings?.i18n_overrides);
  applyBrandSettings(settings);
  applyTheme(settings?.theme);
  document.addEventListener('fbb:langchange', () => { applyI18nOverrides(settings?.i18n_overrides); applyBrandSettings(settings); });
});
