// countries.js — EarnHive
// Full country list with flags, dial codes, currencies
// Exports COUNTRIES array and detectCountryFromIP()

export const COUNTRIES = [
  // ── AFRICA (Paystack) ─────────────────────────────────────────
  {iso:'NG',name:'Nigeria',flag:'🇳🇬',dial:'+234',currency:'NGN',symbol:'₦',payMethod:'paystack'},
  {iso:'GH',name:'Ghana',flag:'🇬🇭',dial:'+233',currency:'GHS',symbol:'GH₵',payMethod:'paystack'},
  {iso:'KE',name:'Kenya',flag:'🇰🇪',dial:'+254',currency:'KES',symbol:'KSh',payMethod:'paystack'},
  {iso:'ZA',name:'South Africa',flag:'🇿🇦',dial:'+27',currency:'ZAR',symbol:'R',payMethod:'paystack'},
  {iso:'EG',name:'Egypt',flag:'🇪🇬',dial:'+20',currency:'EGP',symbol:'E£',payMethod:'paystack'},
  {iso:'ET',name:'Ethiopia',flag:'🇪🇹',dial:'+251',currency:'ETB',symbol:'Br',payMethod:'paystack'},
  {iso:'TZ',name:'Tanzania',flag:'🇹🇿',dial:'+255',currency:'TZS',symbol:'TSh',payMethod:'paystack'},
  {iso:'UG',name:'Uganda',flag:'🇺🇬',dial:'+256',currency:'UGX',symbol:'USh',payMethod:'paystack'},
  {iso:'RW',name:'Rwanda',flag:'🇷🇼',dial:'+250',currency:'RWF',symbol:'Fr',payMethod:'paystack'},
  {iso:'SN',name:'Senegal',flag:'🇸🇳',dial:'+221',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'CI',name:'Ivory Coast',flag:'🇨🇮',dial:'+225',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'CM',name:'Cameroon',flag:'🇨🇲',dial:'+237',currency:'XAF',symbol:'Fr',payMethod:'paystack'},
  {iso:'AO',name:'Angola',flag:'🇦🇴',dial:'+244',currency:'AOA',symbol:'Kz',payMethod:'paystack'},
  {iso:'MZ',name:'Mozambique',flag:'🇲🇿',dial:'+258',currency:'MZN',symbol:'MT',payMethod:'paystack'},
  {iso:'ZM',name:'Zambia',flag:'🇿🇲',dial:'+260',currency:'ZMW',symbol:'ZK',payMethod:'paystack'},
  {iso:'ZW',name:'Zimbabwe',flag:'🇿🇼',dial:'+263',currency:'ZWL',symbol:'Z$',payMethod:'paystack'},
  {iso:'MA',name:'Morocco',flag:'🇲🇦',dial:'+212',currency:'MAD',symbol:'MAD',payMethod:'paystack'},
  {iso:'DZ',name:'Algeria',flag:'🇩🇿',dial:'+213',currency:'DZD',symbol:'دج',payMethod:'paystack'},
  {iso:'TN',name:'Tunisia',flag:'🇹🇳',dial:'+216',currency:'TND',symbol:'DT',payMethod:'paystack'},
  {iso:'LY',name:'Libya',flag:'🇱🇾',dial:'+218',currency:'LYD',symbol:'LD',payMethod:'paystack'},
  {iso:'SD',name:'Sudan',flag:'🇸🇩',dial:'+249',currency:'SDG',symbol:'ج.س.',payMethod:'paystack'},
  {iso:'SO',name:'Somalia',flag:'🇸🇴',dial:'+252',currency:'SOS',symbol:'Sh',payMethod:'paystack'},
  {iso:'MW',name:'Malawi',flag:'🇲🇼',dial:'+265',currency:'MWK',symbol:'MK',payMethod:'paystack'},
  {iso:'BJ',name:'Benin',flag:'🇧🇯',dial:'+229',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'TG',name:'Togo',flag:'🇹🇬',dial:'+228',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'NE',name:'Niger',flag:'🇳🇪',dial:'+227',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'ML',name:'Mali',flag:'🇲🇱',dial:'+223',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'BF',name:'Burkina Faso',flag:'🇧🇫',dial:'+226',currency:'XOF',symbol:'Fr',payMethod:'paystack'},
  {iso:'GN',name:'Guinea',flag:'🇬🇳',dial:'+224',currency:'GNF',symbol:'Fr',payMethod:'paystack'},
  {iso:'SL',name:'Sierra Leone',flag:'🇸🇱',dial:'+232',currency:'SLL',symbol:'Le',payMethod:'paystack'},
  {iso:'LR',name:'Liberia',flag:'🇱🇷',dial:'+231',currency:'LRD',symbol:'L$',payMethod:'paystack'},
  {iso:'GM',name:'Gambia',flag:'🇬🇲',dial:'+220',currency:'GMD',symbol:'D',payMethod:'paystack'},
  {iso:'MR',name:'Mauritania',flag:'🇲🇷',dial:'+222',currency:'MRU',symbol:'UM',payMethod:'paystack'},
  {iso:'NA',name:'Namibia',flag:'🇳🇦',dial:'+264',currency:'NAD',symbol:'N$',payMethod:'paystack'},
  {iso:'BW',name:'Botswana',flag:'🇧🇼',dial:'+267',currency:'BWP',symbol:'P',payMethod:'paystack'},
  {iso:'LS',name:'Lesotho',flag:'🇱🇸',dial:'+266',currency:'LSL',symbol:'L',payMethod:'paystack'},
  {iso:'SZ',name:'Eswatini',flag:'🇸🇿',dial:'+268',currency:'SZL',symbol:'L',payMethod:'paystack'},
  {iso:'MG',name:'Madagascar',flag:'🇲🇬',dial:'+261',currency:'MGA',symbol:'Ar',payMethod:'paystack'},
  {iso:'MU',name:'Mauritius',flag:'🇲🇺',dial:'+230',currency:'MUR',symbol:'₨',payMethod:'paystack'},
  {iso:'CV',name:'Cape Verde',flag:'🇨🇻',dial:'+238',currency:'CVE',symbol:'$',payMethod:'paystack'},
  {iso:'CD',name:'DR Congo',flag:'🇨🇩',dial:'+243',currency:'CDF',symbol:'Fr',payMethod:'paystack'},
  {iso:'CG',name:'Congo',flag:'🇨🇬',dial:'+242',currency:'XAF',symbol:'Fr',payMethod:'paystack'},
  {iso:'GA',name:'Gabon',flag:'🇬🇦',dial:'+241',currency:'XAF',symbol:'Fr',payMethod:'paystack'},

  // ── REST OF WORLD (TON Crypto) ────────────────────────────────
  // Americas
  {iso:'US',name:'United States',flag:'🇺🇸',dial:'+1',currency:'USD',symbol:'$',payMethod:'ton'},
  {iso:'CA',name:'Canada',flag:'🇨🇦',dial:'+1',currency:'CAD',symbol:'CA$',payMethod:'ton'},
  {iso:'GB',name:'United Kingdom',flag:'🇬🇧',dial:'+44',currency:'GBP',symbol:'£',payMethod:'ton'},
  {iso:'AU',name:'Australia',flag:'🇦🇺',dial:'+61',currency:'AUD',symbol:'A$',payMethod:'ton'},
  {iso:'DE',name:'Germany',flag:'🇩🇪',dial:'+49',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'FR',name:'France',flag:'🇫🇷',dial:'+33',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'IT',name:'Italy',flag:'🇮🇹',dial:'+39',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'ES',name:'Spain',flag:'🇪🇸',dial:'+34',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'NL',name:'Netherlands',flag:'🇳🇱',dial:'+31',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'BE',name:'Belgium',flag:'🇧🇪',dial:'+32',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'CH',name:'Switzerland',flag:'🇨🇭',dial:'+41',currency:'CHF',symbol:'Fr',payMethod:'ton'},
  {iso:'SE',name:'Sweden',flag:'🇸🇪',dial:'+46',currency:'SEK',symbol:'kr',payMethod:'ton'},
  {iso:'NO',name:'Norway',flag:'🇳🇴',dial:'+47',currency:'NOK',symbol:'kr',payMethod:'ton'},
  {iso:'DK',name:'Denmark',flag:'🇩🇰',dial:'+45',currency:'DKK',symbol:'kr',payMethod:'ton'},
  {iso:'FI',name:'Finland',flag:'🇫🇮',dial:'+358',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'PL',name:'Poland',flag:'🇵🇱',dial:'+48',currency:'PLN',symbol:'zł',payMethod:'ton'},
  {iso:'CZ',name:'Czech Republic',flag:'🇨🇿',dial:'+420',currency:'CZK',symbol:'Kč',payMethod:'ton'},
  {iso:'RU',name:'Russia',flag:'🇷🇺',dial:'+7',currency:'RUB',symbol:'₽',payMethod:'ton'},
  {iso:'UA',name:'Ukraine',flag:'🇺🇦',dial:'+380',currency:'UAH',symbol:'₴',payMethod:'ton'},
  {iso:'TR',name:'Turkey',flag:'🇹🇷',dial:'+90',currency:'TRY',symbol:'₺',payMethod:'ton'},
  {iso:'IN',name:'India',flag:'🇮🇳',dial:'+91',currency:'INR',symbol:'₹',payMethod:'ton'},
  {iso:'CN',name:'China',flag:'🇨🇳',dial:'+86',currency:'CNY',symbol:'¥',payMethod:'ton'},
  {iso:'JP',name:'Japan',flag:'🇯🇵',dial:'+81',currency:'JPY',symbol:'¥',payMethod:'ton'},
  {iso:'KR',name:'South Korea',flag:'🇰🇷',dial:'+82',currency:'KRW',symbol:'₩',payMethod:'ton'},
  {iso:'ID',name:'Indonesia',flag:'🇮🇩',dial:'+62',currency:'IDR',symbol:'Rp',payMethod:'ton'},
  {iso:'MY',name:'Malaysia',flag:'🇲🇾',dial:'+60',currency:'MYR',symbol:'RM',payMethod:'ton'},
  {iso:'PH',name:'Philippines',flag:'🇵🇭',dial:'+63',currency:'PHP',symbol:'₱',payMethod:'ton'},
  {iso:'TH',name:'Thailand',flag:'🇹🇭',dial:'+66',currency:'THB',symbol:'฿',payMethod:'ton'},
  {iso:'VN',name:'Vietnam',flag:'🇻🇳',dial:'+84',currency:'VND',symbol:'₫',payMethod:'ton'},
  {iso:'PK',name:'Pakistan',flag:'🇵🇰',dial:'+92',currency:'PKR',symbol:'₨',payMethod:'ton'},
  {iso:'BD',name:'Bangladesh',flag:'🇧🇩',dial:'+880',currency:'BDT',symbol:'৳',payMethod:'ton'},
  {iso:'SG',name:'Singapore',flag:'🇸🇬',dial:'+65',currency:'SGD',symbol:'S$',payMethod:'ton'},
  {iso:'AE',name:'UAE',flag:'🇦🇪',dial:'+971',currency:'AED',symbol:'د.إ',payMethod:'ton'},
  {iso:'SA',name:'Saudi Arabia',flag:'🇸🇦',dial:'+966',currency:'SAR',symbol:'﷼',payMethod:'ton'},
  {iso:'QA',name:'Qatar',flag:'🇶🇦',dial:'+974',currency:'QAR',symbol:'﷼',payMethod:'ton'},
  {iso:'KW',name:'Kuwait',flag:'🇰🇼',dial:'+965',currency:'KWD',symbol:'د.ك',payMethod:'ton'},
  {iso:'BR',name:'Brazil',flag:'🇧🇷',dial:'+55',currency:'BRL',symbol:'R$',payMethod:'ton'},
  {iso:'MX',name:'Mexico',flag:'🇲🇽',dial:'+52',currency:'MXN',symbol:'$',payMethod:'ton'},
  {iso:'AR',name:'Argentina',flag:'🇦🇷',dial:'+54',currency:'ARS',symbol:'$',payMethod:'ton'},
  {iso:'CO',name:'Colombia',flag:'🇨🇴',dial:'+57',currency:'COP',symbol:'$',payMethod:'ton'},
  {iso:'CL',name:'Chile',flag:'🇨🇱',dial:'+56',currency:'CLP',symbol:'$',payMethod:'ton'},
  {iso:'PE',name:'Peru',flag:'🇵🇪',dial:'+51',currency:'PEN',symbol:'S/',payMethod:'ton'},
  {iso:'NZ',name:'New Zealand',flag:'🇳🇿',dial:'+64',currency:'NZD',symbol:'NZ$',payMethod:'ton'},
  {iso:'AT',name:'Austria',flag:'🇦🇹',dial:'+43',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'PT',name:'Portugal',flag:'🇵🇹',dial:'+351',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'GR',name:'Greece',flag:'🇬🇷',dial:'+30',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'HU',name:'Hungary',flag:'🇭🇺',dial:'+36',currency:'HUF',symbol:'Ft',payMethod:'ton'},
  {iso:'RO',name:'Romania',flag:'🇷🇴',dial:'+40',currency:'RON',symbol:'lei',payMethod:'ton'},
  {iso:'BG',name:'Bulgaria',flag:'🇧🇬',dial:'+359',currency:'BGN',symbol:'лв',payMethod:'ton'},
  {iso:'HR',name:'Croatia',flag:'🇭🇷',dial:'+385',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'SK',name:'Slovakia',flag:'🇸🇰',dial:'+421',currency:'EUR',symbol:'€',payMethod:'ton'},
  {iso:'IL',name:'Israel',flag:'🇮🇱',dial:'+972',currency:'ILS',symbol:'₪',payMethod:'ton'},
  {iso:'NG',name:'Nigeria',flag:'🇳🇬',dial:'+234',currency:'NGN',symbol:'₦',payMethod:'paystack'},
];

// Remove duplicate NG
const seen = new Set();
export const COUNTRIES_UNIQUE = COUNTRIES.filter(c => {
  if(seen.has(c.iso)) return false;
  seen.add(c.iso);
  return true;
});

// Re-export as COUNTRIES (deduplicated, Nigeria first)
const NG = COUNTRIES_UNIQUE.find(c => c.iso === 'NG');
const rest = COUNTRIES_UNIQUE.filter(c => c.iso !== 'NG');
export { COUNTRIES_UNIQUE as COUNTRIES };

// ── Auto-detect country from IP ──────────────
export async function detectCountryFromIP() {
  try {
    const res  = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    const iso  = data.country_code;
    return COUNTRIES_UNIQUE.find(c => c.iso === iso) || null;
  } catch(e) {
    // Default to Nigeria if detection fails
    return COUNTRIES_UNIQUE.find(c => c.iso === 'NG');
  }
}

// ── African country ISO codes ─────────────────
export const AFRICAN_ISOS = [
  'NG','GH','KE','ZA','EG','ET','TZ','UG','RW','SN','CI','CM','AO',
  'MZ','ZM','ZW','MA','DZ','TN','LY','SD','SO','MW','BJ','TG','NE',
  'ML','BF','GN','SL','LR','GM','MR','NA','BW','LS','SZ','MG','MU',
  'CV','CD','CG','GA','GQ','ST','KM','ER','DJ','SS','CF','TD','SC','RE'
];

export function isAfrican(iso) {
  return AFRICAN_ISOS.includes((iso || '').toUpperCase());
}

export function getPaymentMethod(iso) {
  return isAfrican(iso) ? 'paystack' : 'ton';
}
