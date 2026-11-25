// Every active ISO 4217 currency, with its usual number of decimals.
// Common ones first so the picker opens on what you're likely to want.

export const COMMON = ['NZD', 'BDT', 'USD', 'AUD', 'GBP', 'EUR', 'INR', 'CAD', 'SGD', 'MYR', 'AED', 'SAR', 'JPY', 'CNY'];

const ZERO = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
const THREE = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];

export const CURRENCIES = [
  ['AED', 'UAE dirham'], ['AFN', 'Afghan afghani'], ['ALL', 'Albanian lek'], ['AMD', 'Armenian dram'], ['ANG', 'Netherlands Antillean guilder'],
  ['AOA', 'Angolan kwanza'], ['ARS', 'Argentine peso'], ['AUD', 'Australian dollar'], ['AWG', 'Aruban florin'], ['AZN', 'Azerbaijani manat'],
  ['BAM', 'Bosnia-Herzegovina mark'], ['BBD', 'Barbados dollar'], ['BDT', 'Bangladeshi taka'], ['BGN', 'Bulgarian lev'], ['BHD', 'Bahraini dinar'],
  ['BIF', 'Burundian franc'], ['BMD', 'Bermudian dollar'], ['BND', 'Brunei dollar'], ['BOB', 'Bolivian boliviano'], ['BRL', 'Brazilian real'],
  ['BSD', 'Bahamian dollar'], ['BTN', 'Bhutanese ngultrum'], ['BWP', 'Botswana pula'], ['BYN', 'Belarusian ruble'], ['BZD', 'Belize dollar'],
  ['CAD', 'Canadian dollar'], ['CDF', 'Congolese franc'], ['CHF', 'Swiss franc'], ['CLP', 'Chilean peso'], ['CNY', 'Chinese yuan'],
  ['COP', 'Colombian peso'], ['CRC', 'Costa Rican colón'], ['CUP', 'Cuban peso'], ['CVE', 'Cape Verdean escudo'], ['CZK', 'Czech koruna'],
  ['DJF', 'Djiboutian franc'], ['DKK', 'Danish krone'], ['DOP', 'Dominican peso'], ['DZD', 'Algerian dinar'], ['EGP', 'Egyptian pound'],
  ['ERN', 'Eritrean nakfa'], ['ETB', 'Ethiopian birr'], ['EUR', 'Euro'], ['FJD', 'Fijian dollar'], ['FKP', 'Falkland Islands pound'],
  ['GBP', 'British pound'], ['GEL', 'Georgian lari'], ['GHS', 'Ghanaian cedi'], ['GIP', 'Gibraltar pound'], ['GMD', 'Gambian dalasi'],
  ['GNF', 'Guinean franc'], ['GTQ', 'Guatemalan quetzal'], ['GYD', 'Guyanese dollar'], ['HKD', 'Hong Kong dollar'], ['HNL', 'Honduran lempira'],
  ['HTG', 'Haitian gourde'], ['HUF', 'Hungarian forint'], ['IDR', 'Indonesian rupiah'], ['ILS', 'Israeli shekel'], ['INR', 'Indian rupee'],
  ['IQD', 'Iraqi dinar'], ['IRR', 'Iranian rial'], ['ISK', 'Icelandic króna'], ['JMD', 'Jamaican dollar'], ['JOD', 'Jordanian dinar'],
  ['JPY', 'Japanese yen'], ['KES', 'Kenyan shilling'], ['KGS', 'Kyrgyzstani som'], ['KHR', 'Cambodian riel'], ['KMF', 'Comorian franc'],
  ['KPW', 'North Korean won'], ['KRW', 'South Korean won'], ['KWD', 'Kuwaiti dinar'], ['KYD', 'Cayman Islands dollar'], ['KZT', 'Kazakhstani tenge'],
  ['LAK', 'Lao kip'], ['LBP', 'Lebanese pound'], ['LKR', 'Sri Lankan rupee'], ['LRD', 'Liberian dollar'], ['LSL', 'Lesotho loti'],
  ['LYD', 'Libyan dinar'], ['MAD', 'Moroccan dirham'], ['MDL', 'Moldovan leu'], ['MGA', 'Malagasy ariary'], ['MKD', 'Macedonian denar'],
  ['MMK', 'Myanmar kyat'], ['MNT', 'Mongolian tögrög'], ['MOP', 'Macanese pataca'], ['MRU', 'Mauritanian ouguiya'], ['MUR', 'Mauritian rupee'],
  ['MVR', 'Maldivian rufiyaa'], ['MWK', 'Malawian kwacha'], ['MXN', 'Mexican peso'], ['MYR', 'Malaysian ringgit'], ['MZN', 'Mozambican metical'],
  ['NAD', 'Namibian dollar'], ['NGN', 'Nigerian naira'], ['NIO', 'Nicaraguan córdoba'], ['NOK', 'Norwegian krone'], ['NPR', 'Nepalese rupee'],
  ['NZD', 'New Zealand dollar'], ['OMR', 'Omani rial'], ['PAB', 'Panamanian balboa'], ['PEN', 'Peruvian sol'], ['PGK', 'Papua New Guinean kina'],
  ['PHP', 'Philippine peso'], ['PKR', 'Pakistani rupee'], ['PLN', 'Polish złoty'], ['PYG', 'Paraguayan guaraní'], ['QAR', 'Qatari riyal'],
  ['RON', 'Romanian leu'], ['RSD', 'Serbian dinar'], ['RUB', 'Russian ruble'], ['RWF', 'Rwandan franc'], ['SAR', 'Saudi riyal'],
  ['SBD', 'Solomon Islands dollar'], ['SCR', 'Seychellois rupee'], ['SDG', 'Sudanese pound'], ['SEK', 'Swedish krona'], ['SGD', 'Singapore dollar'],
  ['SHP', 'Saint Helena pound'], ['SLE', 'Sierra Leonean leone'], ['SOS', 'Somali shilling'], ['SRD', 'Surinamese dollar'], ['SSP', 'South Sudanese pound'],
  ['STN', 'São Tomé and Príncipe dobra'], ['SYP', 'Syrian pound'], ['SZL', 'Eswatini lilangeni'], ['THB', 'Thai baht'], ['TJS', 'Tajikistani somoni'],
  ['TMT', 'Turkmenistani manat'], ['TND', 'Tunisian dinar'], ['TOP', 'Tongan paʻanga'], ['TRY', 'Turkish lira'], ['TTD', 'Trinidad and Tobago dollar'],
  ['TWD', 'New Taiwan dollar'], ['TZS', 'Tanzanian shilling'], ['UAH', 'Ukrainian hryvnia'], ['UGX', 'Ugandan shilling'], ['USD', 'US dollar'],
  ['UYU', 'Uruguayan peso'], ['UZS', 'Uzbekistani som'], ['VES', 'Venezuelan bolívar'], ['VND', 'Vietnamese đồng'], ['VUV', 'Vanuatu vatu'],
  ['WST', 'Samoan tālā'], ['XAF', 'Central African CFA franc'], ['XCD', 'East Caribbean dollar'], ['XOF', 'West African CFA franc'], ['XPF', 'CFP franc'],
  ['YER', 'Yemeni rial'], ['ZAR', 'South African rand'], ['ZMW', 'Zambian kwacha'], ['ZWG', 'Zimbabwe gold'],
];

const NAMES = Object.fromEntries(CURRENCIES);

export const currencyName = (code) => NAMES[code] || code;
export const currencyDecimals = (code) => (ZERO.includes(code) ? 0 : THREE.includes(code) ? 3 : 2);
export const isCurrency = (code) => !!NAMES[String(code || '').toUpperCase()];

// Common first, then the rest A to Z.
export function sortedCurrencies() {
  const rest = CURRENCIES.filter(([c]) => !COMMON.includes(c));
  return [...COMMON.map((c) => [c, NAMES[c]]), ...rest];
}
