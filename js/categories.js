// Hoofdgroepen en categorieen met standaard trefwoorden.
// Trefwoorden worden genormaliseerd (kleine letters, zonder leestekens) en als heel woord
// of woordgroep gezocht in de naam en omschrijving van een transactie.
// Een trefwoord dat eindigt op * matcht ook woorden die ermee beginnen (kapper* -> kapperszaak).
// dir: 'out' = alleen afschrijvingen, 'in' = alleen bijschrijvingen, leeg = beide.

export const GROUPS = [
  { id: 'boodschappen', name: 'Boodschappen', icon: '🛒', color: '#1baf7a', type: 'expense' },
  { id: 'eten', name: 'Eten en drinken', icon: '🍔', color: '#eb6834', type: 'expense' },
  { id: 'wonen', name: 'Wonen', icon: '🏠', color: '#2a78d6', type: 'expense', fixed: true },
  { id: 'vervoer', name: 'Vervoer', icon: '🚗', color: '#eda100', type: 'expense' },
  { id: 'kleding', name: 'Kleding en verzorging', icon: '👕', color: '#e87ba4', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#6250d6', type: 'expense' },
  { id: 'abonnementen', name: 'Abonnementen', icon: '📱', color: '#e34948', type: 'expense', fixed: true },
  { id: 'vrijetijd', name: 'Sport en vrije tijd', icon: '🏀', color: '#008300', type: 'expense' },
  { id: 'uitgaan', name: 'Uitgaan', icon: '🎉', color: '#b45309', type: 'expense' },
  { id: 'reizen', name: 'Reizen', icon: '✈️', color: '#0e7490', type: 'expense' },
  { id: 'gezondheid', name: 'Gezondheid', icon: '💊', color: '#9d174d', type: 'expense' },
  { id: 'verzekeringen', name: 'Verzekeringen', icon: '🛡️', color: '#475569', type: 'expense', fixed: true },
  { id: 'financieel', name: 'Belasting en bank', icon: '🏦', color: '#78716c', type: 'expense' },
  { id: 'personen', name: 'Familie en vrienden', icon: '👥', color: '#c026d3', type: 'expense' },
  { id: 'opleiding', name: 'Opleiding', icon: '🎓', color: '#65a30d', type: 'expense' },
  { id: 'goededoelen', name: 'Goede doelen', icon: '❤️', color: '#be123c', type: 'expense' },
  { id: 'huisdieren', name: 'Huisdieren', icon: '🐾', color: '#a16207', type: 'expense' },
  { id: 'contant', name: 'Contant geld', icon: '💵', color: '#64748b', type: 'expense' },
  { id: 'overig', name: 'Overig', icon: '📦', color: '#a8a29e', type: 'expense' },
  { id: 'inkomen', name: 'Inkomsten', icon: '💶', color: '#0f8a5f', type: 'income' },
  { id: 'overboeking', name: 'Sparen en beleggen', icon: '🔁', color: '#5b6b78', type: 'transfer' },
];

export const UNCATEGORIZED = 'onbekend';
export const UNCATEGORIZED_IN = 'onbekend-in';

export const CATEGORIES = [
  // Boodschappen
  { id: 'supermarkt', group: 'boodschappen', name: 'Supermarkt', icon: '🛒', kw: ['albert heijn', 'ah', 'ah to go', 'jumbo', 'lidl', 'aldi', 'plus', 'dirk', 'dirk van den broek', 'dekamarkt', 'deka markt', 'vomar', 'hoogvliet', 'spar', 'coop', 'poiesz', 'jan linders', 'nettorama', 'boni', 'mcd supermarkt', 'picnic', 'crisp', 'flink', 'getir', 'ekoplaza', 'marqt', 'odin', 'amazing oriental', 'tanger', 'makro', 'sligro', 'hanos', 'boon s markt', 'emte'] },
  { id: 'drogist', group: 'boodschappen', name: 'Drogist', icon: '🧴', kw: ['kruidvat', 'etos', 'trekpleister', 'da drogist', 'holland barrett', 'holland and barrett', 'dm drogerie'] },
  { id: 'versspeciaal', group: 'boodschappen', name: 'Bakker, slager en markt', icon: '🥖', kw: ['bakker*', 'bakkerij', 'slager*', 'slagerij', 'keurslager', 'poelier', 'visboer', 'vishandel', 'kaashandel', 'kaasboer', 'groenteboer', 'markt', 'bakkersland'] },
  { id: 'slijterij', group: 'boodschappen', name: 'Slijterij', icon: '🍾', kw: ['gall gall', 'gall', 'mitra', 'slijterij', 'drankenhandel', 'drankencentrale', 'wijnhandel'] },

  // Eten en drinken
  { id: 'fastfood', group: 'eten', name: 'Fastfood', icon: '🍟', kw: ['mcdonald*', 'mc donalds', 'burger king', 'kfc', 'subway', 'febo', 'five guys', 'popeyes', 'taco bell', 'dominos', 'domino s', 'new york pizza', 'papa john*', 'smullers', 'snackbar', 'cafetaria', 'friettent', 'frituur', 'wok to walk', 'manneken pis', 'the fat dog', 'ben s cookies'] },
  { id: 'bezorging', group: 'eten', name: 'Bezorging', icon: '🛵', kw: ['thuisbezorgd', 'takeaway', 'just eat', 'uber eats', 'ubereats', 'deliveroo', 'gorillas'] },
  { id: 'koffie', group: 'eten', name: 'Koffie en lunch', icon: '☕', kw: ['starbucks', 'coffee company', 'bagels beans', 'anne max', 'doppio', 'koffie*', 'coffee', 'espresso', 'lunchroom', 'broodje*', 'bakery', 'la place', 'kiosk', 'julia s', 'stach', 'kantine', 'bedrijfsrestaurant', 'sodexo', 'eurest', 'compass group', 'koffiebar'] },
  { id: 'restaurant', group: 'eten', name: 'Uit eten', icon: '🍽️', kw: ['restaurant', 'bistro', 'brasserie', 'eetcafe', 'grill', 'steakhouse', 'sushi', 'pizzeria', 'trattoria', 'ristorante', 'wok', 'shoarma', 'kebab', 'doner', 'ramen', 'poke', 'thai', 'indisch', 'chinees', 'grieks', 'italiaans', 'tapas', 'van der valk', 'loetje', 'happy italy', 'vapiano', 'wagamama', 'pasta', 'burger', 'burgers', 'thefork'] },

  // Wonen
  { id: 'huur', group: 'wonen', name: 'Huur of hypotheek', icon: '🔑', dir: 'out', kw: ['huur', 'hypotheek', 'woningcorporatie', 'woonstichting', 'vesteda', 'ymere', 'eigen haard', 'de alliantie', 'woonzorg', 'kennemer wonen', 'parteon', 'woonwaard', 'rochdale', 'stadgenoot'] },
  { id: 'kostgeld', group: 'wonen', name: 'Kostgeld', icon: '🏡', dir: 'out', kw: ['kostgeld', 'kost en inwoning', 'bijdrage huishouden', 'huishoudpot'] },
  { id: 'energie', group: 'wonen', name: 'Energie en water', icon: '⚡', kw: ['vattenfall', 'eneco', 'essent', 'greenchoice', 'budget energie', 'energiedirect', 'vandebron', 'frank energie', 'tibber', 'pure energie', 'oxxio', 'engie', 'innova energie', 'energie*', 'pwn', 'vitens', 'evides', 'dunea', 'waternet', 'brabant water', 'oasen', 'wml', 'waterbedrijf', 'liander', 'stedin', 'enexis'] },
  { id: 'internet', group: 'wonen', name: 'Internet en tv', icon: '📡', kw: ['ziggo', 'kpn internet', 'delta fiber', 'caiway', 'odido thuis', 'glasvezel', 'solcon', 'freedom internet', 'online nl'] },
  { id: 'gemeente', group: 'wonen', name: 'Gemeentelijke lasten', icon: '🏛️', kw: ['gemeente', 'gemeentebelasting*', 'hhnk', 'hoogheemraadschap', 'waterschap', 'cannock', 'belastingsamenwerking', 'bsgr', 'gbhw', 'svhw', 'cocensus'] },
  { id: 'inrichting', group: 'wonen', name: 'Inrichting', icon: '🛋️', kw: ['ikea', 'jysk', 'leen bakker', 'kwantum', 'goossens', 'beter bed', 'swiss sense', 'auping', 'loods 5', 'xenos', 'westwing', 'home24', 'fonq', 'vtwonen', 'karwei wonen', 'woonboulevard', 'dille kamille', 'sostrene grene', 'sissy boy home'] },
  { id: 'klussen', group: 'wonen', name: 'Klussen en tuin', icon: '🔨', kw: ['gamma', 'praxis', 'karwei', 'hornbach', 'hubo', 'bauhaus', 'toolstation', 'formido', 'intratuin', 'tuincentrum', 'welkoop', 'boerenbond', 'ranzijn', 'bouwmarkt', 'hema bouw'] },

  // Vervoer
  { id: 'brandstof', group: 'vervoer', name: 'Brandstof', icon: '⛽', kw: ['shell', 'bp', 'esso', 'total', 'totalenergies', 'texaco', 'tango', 'tinq', 'gulf', 'avia', 'argos', 'q8', 'firezone', 'fieten', 'tamoil', 'makro tank', 'tankstation', 'tankst', 'lukoil', 'ok tankstation', 'fastned', 'allego', 'ionity', 'vattenfall incharge', 'shell recharge', 'laadpaal'] },
  { id: 'ov', group: 'vervoer', name: 'Openbaar vervoer', icon: '🚆', kw: ['ns', 'ns groep', 'nederlandse spoorwegen', 'ns reizigers', 'ovpay', 'nlov*', 'ov chipkaart', 'ov chip', 'translink', 'gvb', 'ret', 'htm', 'connexxion', 'arriva', 'qbuzz', 'keolis', 'ebs', 'hermes', 'syntus', 'u ov', 'r net', 'flixbus', 'eurostar', 'thalys', 'db bahn', 'deutsche bahn', 'sncb', '9292'] },
  { id: 'parkeren', group: 'vervoer', name: 'Parkeren', icon: '🅿️', kw: ['q park', 'parkmobile', 'yellowbrick', 'easypark', 'parkbee', 'interparking', 'apcoa', 'parkeer*', 'parking', 'p1 parking', 'shuttle parking'] },
  { id: 'auto', group: 'vervoer', name: 'Auto en onderhoud', icon: '🔧', kw: ['apk', 'garage', 'autobedrijf', 'kwik fit', 'euromaster', 'profile tyrecenter', 'vakgarage', 'bovag', 'anwb', 'carglass', 'autowas*', 'wasstraat', 'carwash', 'autobanden', 'halfords', 'rdw', 'wegenbelasting', 'motorrijtuigenbelasting', 'kia', 'toyota', 'volkswagen', 'autodealer', 'hedin', 'stern', 'louwman'] },
  { id: 'taxi', group: 'vervoer', name: 'Taxi en deelvervoer', icon: '🚕', kw: ['uber', 'bolt', 'taxi', 'felyx', 'check technologies', 'go sharing', 'gosharing', 'lime', 'tier', 'dott', 'greenwheels', 'mywheels', 'snappcar', 'sixt', 'europcar', 'hertz', 'avis', 'enterprise rent'] },
  { id: 'fiets', group: 'vervoer', name: 'Fiets', icon: '🚲', kw: ['swapfiets', 'fietsenwinkel', 'fietsenmaker', 'rijwiel*', 'fietsplan', 'vanmoof', 'cowboy bikes', 'bike totaal', 'fietsenstalling'] },
  { id: 'tol', group: 'vervoer', name: 'Tol en vignetten', icon: '🛣️', kw: ['tol', 'peage', 'vignet', 'asfinag', 'westerscheldetunnel', 'kiltunnel', 'autostrade'] },

  // Kleding en verzorging
  { id: 'kleding', group: 'kleding', name: 'Kleding', icon: '👕', kw: ['zalando', 'card:h m', 'hm', 'hennes mauritz', 'zara', 'primark', 'card:c a', 'we fashion', 'only', 'jack jones', 'bershka', 'pull bear', 'stradivarius', 'uniqlo', 'mango', 'asos', 'about you', 'shein', 'score', 'costes', 'the sting', 'america today', 'hunkemoller', 'jd sports', 'jd', 'snipes', 'foot locker', 'footlocker', 'nike', 'adidas', 'puma', 'new balance', 'scotch soda', 'g star', 'tommy hilfiger', 'calvin klein', 'ralph lauren', 'levi*', 'zeeman', 'wibra', 'peek cloppenburg', 'vanguard', 'suitsupply', 'jack and jones', 'vero moda', 'superdry', 'the north face', 'stone island', 'arket', 'cos', 'weekday', 'monki', 'esprit', 'sissy boy', 'didi', 'ms mode', 'open32', 'aboutyou', 'vinted', 'wehkamp kleding', 'bristol', 'van dal mannenmode', 'state of art', 'cars jeans', 'kith', 'the outlet', 'outlet', 'decathlon kleding'] },
  { id: 'schoenen', group: 'kleding', name: 'Schoenen', icon: '👟', kw: ['omoda', 'van haren', 'sacha', 'schuurman schoenen', 'nelson schoenen', 'scapino', 'dr martens', 'schoenen*', 'shoes', 'sneaker*', 'manfield', 'van lier'] },
  { id: 'kapper', group: 'kleding', name: 'Kapper', icon: '💈', kw: ['kapper*', 'barber*', 'barbershop', 'haarstudio', 'hairstyl*', 'hair', 'salon', 'kapsalon', 'headlines', 'kinki', 'toni guy'] },
  { id: 'verzorging', group: 'kleding', name: 'Verzorging en parfum', icon: '🧼', kw: ['douglas', 'rituals', 'ici paris', 'lush', 'the body shop', 'sephora', 'parfum*', 'iciparisxl', 'nail*', 'beauty', 'skincare', 'manscaped', 'gillette', 'harrys'] },

  // Shopping
  { id: 'elektronica', group: 'shopping', name: 'Elektronica', icon: '💻', kw: ['coolblue', 'mediamarkt', 'media markt', 'bcc', 'apple store', 'apple retail', 'alternate', 'megekko', 'azerty', 'paradigit', 'samsung', 'expert', 'electro world', 'belsimpel', 'gsmpunt', 'phone house', 'informatique', 'centralpoint', 'proshop', 'logitech', 'sony', 'bose', 'dji', 'gopro', 'ipad', 'iphone'] },
  { id: 'online', group: 'shopping', name: 'Webshops', icon: '📦', kw: ['bol com', 'bol', 'bol com bv', 'amazon', 'amzn', 'aliexpress', 'temu', 'wehkamp', 'marktplaats', 'ebay', 'etsy', 'lightinthebox', 'vidaxl', 'bax shop', 'conrad', 'joom', 'joom nl'] },
  { id: 'warenhuis', group: 'shopping', name: 'Warenhuis en huishouden', icon: '🏬', kw: ['action', 'hema', 'blokker', 'flying tiger', 'big bazar', 'tuincentrum', 'bijenkorf', 'de bijenkorf', 'xenos', 'kwantum', 'pipoos', 'hobbydos', 'lucardi', 'pandora', 'swarovski', 'mostert', 'dixons', 'expert', 'bruna winkel', 'kruidvat huishoud'] },
  { id: 'sportwinkel', group: 'shopping', name: 'Sportartikelen', icon: '⚽', kw: ['decathlon', 'intersport', 'perry sport', 'aktiesport', 'sportdirect', 'sports direct', 'runnersworld', 'run2day', 'bever', 'a s adventure', 'gymshark', 'myprotein', 'bodyandfit', 'body fit', 'xxl nutrition', 'prozis', 'bulk powders'] },
  { id: 'boeken', group: 'shopping', name: 'Boeken en media', icon: '📚', kw: ['bruna', 'ako', 'boekhandel', 'boekenvoordeel', 'libris', 'standaard boekhandel', 'waterstones', 'readshop', 'the read shop', 'audible', 'kobo', 'kindle', 'storytel'] },
  { id: 'cadeaus', group: 'shopping', name: 'Cadeaus en bloemen', icon: '🎁', kw: ['cadeau*', 'kado*', 'bloem*', 'fleurop', 'bloomon', 'bol cadeaukaart', 'giftcard', 'cadeaukaart', 'vvv cadeaukaart', 'tikkie cadeau', 'intertoys', 'bart smit', 'top1toys', 'lego'] },

  // Abonnementen
  { id: 'streaming', group: 'abonnementen', name: 'Streaming', icon: '📺', kw: ['netflix', 'spotify', 'disney plus', 'disneyplus', 'disney', 'videoland', 'hbo max', 'hbo', 'max', 'prime video', 'amazon prime', 'youtube premium', 'youtube', 'apple tv', 'apple music', 'nba league pass', 'league pass', 'nba com', 'dazn', 'espn', 'ziggo sport', 'viaplay', 'npo plus', 'npo start', 'skyshowtime', 'paramount', 'deezer', 'tidal', 'twitch', 'patreon', 'crunchyroll'] },
  { id: 'telefoon', group: 'abonnementen', name: 'Telefoon', icon: '📞', kw: ['kpn', 'vodafone', 't mobile', 'tmobile', 'odido', 'tele2', 'simyo', 'lebara', 'lycamobile', 'youfone', 'ben nl', 'ben mobiel', 'hollandsnieuwe', 'budget mobiel', 'simpel', 'robin mobile', 'vodafoneziggo'] },
  { id: 'software', group: 'abonnementen', name: 'Software en apps', icon: '🧩', kw: ['apple com bill', 'apple com', 'itunes', 'app store', 'google play', 'google storage', 'google one', 'google', 'microsoft', 'xbox game pass', 'office 365', 'adobe', 'dropbox', 'icloud', 'anthropic', 'claude ai', 'openai', 'chatgpt', 'canva', 'notion', 'nordvpn', 'surfshark', 'expressvpn', 'duolingo', 'strava', 'linkedin', 'github', 'jetbrains', 'autodesk', 'solidworks', 'mathworks', '1password', 'bitwarden', 'tinder', 'bumble', 'hinge'] },
  { id: 'nieuws', group: 'abonnementen', name: 'Kranten en tijdschriften', icon: '📰', kw: ['de telegraaf', 'telegraaf', 'volkskrant', 'nrc', 'het parool', 'parool', 'ad nl', 'algemeen dagblad', 'noordhollands dagblad', 'dpg media', 'mediahuis', 'blendle', 'readly', 'the economist', 'financieel dagblad', 'fd mediagroep', 'quote', 'kijk', 'voetbal international'] },
  { id: 'abonnement-overig', group: 'abonnementen', name: 'Overige abonnementen', icon: '🔄', kw: ['abonnement', 'subscription', 'lidmaatschap', 'membership', 'contributie maand'] },

  // Sport en vrije tijd
  { id: 'sportschool', group: 'vrijetijd', name: 'Sportschool', icon: '🏋️', kw: ['basic fit', 'basicfit', 'sportcity', 'sport city', 'fit for free', 'fitforfree', 'trainmore', 'anytime fitness', 'big gym', 'healthcity', 'clubsportive', 'snap fitness', 'fitness*', 'gym', 'crossfit', 'boulder*', 'klimhal', 'yoga', 'padel*', 'squash', 'zwembad', 'sportfondsen'] },
  { id: 'sportclub', group: 'vrijetijd', name: 'Sportclub en contributie', icon: '🏆', kw: ['contributie', 'sportvereniging', 'voetbalvereniging', 'vv', 'basketbal*', 'hockeyclub', 'tennisvereniging', 'knvb', 'nbb', 'atletiekvereniging', 'golf', 'golfbaan', 'skihal', 'snowworld'] },
  { id: 'games', group: 'vrijetijd', name: 'Games', icon: '🎮', kw: ['steam', 'steampowered', 'valve', 'playstation', 'sony interactive', 'psn', 'xbox', 'nintendo', 'epic games', 'riot games', 'blizzard', 'battle net', 'ea games', 'electronic arts', 'ubisoft', 'rockstar', 'nedgame', 'game mania', 'gamemania', 'instant gaming', 'g2a', 'kinguin', 'roblox', 'supercell'] },
  { id: 'gokken', group: 'vrijetijd', name: 'Gokken en loterij', icon: '🎲', kw: ['toto', 'nederlandse loterij', 'holland casino', 'unibet', 'jacks', 'jacks nl', 'betcity', 'bet365', 'tonybet', 'leovegas', 'kansino', 'bingoal', 'one casino', 'zebet', 'betnation', 'starcasino', 'vbet', 'staatsloterij', 'lotto', 'postcode loterij', 'vriendenloterij', 'eurojackpot', 'krasloten', 'luckydays'] },
  { id: 'hobby', group: 'vrijetijd', name: 'Hobby en uitjes', icon: '🎨', kw: ['efteling', 'walibi', 'duinrell', 'toverland', 'slagharen', 'artis', 'blijdorp', 'burgers zoo', 'beekse bergen', 'museum*', 'rijksmuseum', 'nemo', 'escape*', 'lasergame*', 'karting', 'kartbaan', 'bowling', 'midgetgolf', 'trampolinepark', 'jump xl', 'pathe thuis'] },

  // Uitgaan
  { id: 'kroeg', group: 'uitgaan', name: 'Kroeg en bar', icon: '🍺', kw: ['cafe', 'bar', 'kroeg', 'pub', 'irish pub', 'proeflokaal', 'brouwerij', 'tapperij', 'biercafe', 'cocktail*', 'lounge', 'grand cafe', 'strandtent', 'beachclub'] },
  { id: 'feest', group: 'uitgaan', name: 'Feesten en festivals', icon: '🎶', kw: ['paylogic', 'ticketmaster', 'eventbrite', 'see tickets', 'ticketswap', 'eventix', 'tibbaa', 'yourticketprovider', 'ticketkantoor', 'festival*', 'discotheek', 'ziggo dome', 'afas live', 'johan cruijff arena', 'melkweg', 'paradiso', 'tivoli', 'gelredome', 'ahoy', 'mysteryland', 'awakenings', 'dgtl', 'lowlands', 'pinkpop', 'defqon', 'qdance', 'q dance', 'id t', 'ticketcounter', 'guts tickets', 'weeztix'] },
  { id: 'bioscoop', group: 'uitgaan', name: 'Bioscoop en theater', icon: '🎬', kw: ['pathe', 'vue', 'kinepolis', 'filmhuis', 'bioscoop', 'cinema', 'theater', 'schouwburg', 'concertgebouw', 'stage entertainment', 'ntk', 'comedy*', 'boom chicago'] },

  // Reizen
  { id: 'vliegen', group: 'reizen', name: 'Vliegtickets', icon: '✈️', kw: ['klm', 'transavia', 'ryanair', 'easyjet', 'vueling', 'wizz air', 'wizzair', 'tui fly', 'tuifly', 'corendon', 'lufthansa', 'british airways', 'air france', 'turkish airlines', 'emirates', 'qatar airways', 'sunexpress', 'pegasus', 'norwegian', 'iberia', 'tap portugal', 'skyscanner', 'kiwi com', 'vliegtickets', 'schiphol', 'eindhoven airport'] },
  { id: 'verblijf', group: 'reizen', name: 'Hotels en verblijf', icon: '🏨', kw: ['booking com', 'booking', 'airbnb', 'hotels com', 'expedia', 'agoda', 'trivago', 'hostelworld', 'center parcs', 'landal', 'roompot', 'hotel*', 'hostel', 'camping', 'bed breakfast', 'nh hotel', 'ibis', 'accor', 'marriott', 'hilton', 'van der valk hotel'] },
  { id: 'vakantie', group: 'reizen', name: 'Vakanties en reisorganisaties', icon: '🏖️', kw: ['tui', 'sunweb', 'd reizen', 'dreizen', 'corendon vakanties', 'neckermann', 'vakantiediscounter', 'eliza was here', 'travelbird', 'anwb reizen', 'snowtrex', 'skipas', 'skiverhuur', 'getyourguide', 'viator', 'klook'] },

  { id: 'reis-uitgaven', group: 'reizen', name: 'Uitgaven op reis', icon: '🧳', dir: 'out', kw: [] },

  // Gezondheid
  { id: 'zorgverzekering', group: 'gezondheid', name: 'Zorgverzekering', icon: '🩺', dir: 'out', kw: ['zilveren kruis', 'cz groep', 'cz', 'vgz', 'menzis', 'dsw', 'onvz', 'fbto', 'ditzo', 'zekur', 'anderzorg', 'ohra zorg', 'interpolis zorg', 'univé zorg', 'unive zorg', 'zorg en zekerheid', 'pnozorg', 'salland', 'eno', 'de friesland', 'iza', 'zorgverzekering', 'eigen risico', 'stad holland'] },
  { id: 'apotheek', group: 'gezondheid', name: 'Apotheek', icon: '💊', kw: ['apotheek', 'apotheker', 'benu', 'mediq', 'service apotheek', 'farmacie'] },
  { id: 'zorg', group: 'gezondheid', name: 'Zorgverleners', icon: '🦷', kw: ['tandarts*', 'mondzorg', 'orthodont*', 'huisarts*', 'fysio*', 'fysiotherap*', 'ziekenhuis', 'medisch centrum', 'infomedics', 'cmi', 'psycholoog', 'dermatolo*', 'podotherap*', 'chiropract*', 'osteopa*', 'labdiagnostiek'] },
  { id: 'opticien', group: 'gezondheid', name: 'Opticien en lenzen', icon: '👓', kw: ['specsavers', 'pearle', 'hans anders', 'eye wish', 'eyewish', 'lensonline', 'lenzen', 'opticien', 'ace tate', 'brillen*'] },

  // Verzekeringen
  { id: 'verzekering', group: 'verzekeringen', name: 'Verzekeringen', icon: '🛡️', dir: 'out', kw: ['centraal beheer', 'allianz', 'nationale nederlanden', 'aegon', 'asr', 'a s r', 'inshared', 'ohra', 'interpolis', 'unive', 'univé', 'fbto verzekering', 'ditzo verzekering', 'nn schadeverzekering', 'klaverblad', 'reaal', 'achmea', 'verzekering*', 'polis', 'anwb verzekeren', 'independer', 'promovendum', 'abn amro verzekeringen', 'insify'] },

  // Belasting en bank
  { id: 'bankkosten', group: 'financieel', name: 'Bankkosten', icon: '🏦', dir: 'out', kw: ['abn amro bank n v', 'kosten basic package', 'basic package', 'betaalpakket', 'bankkosten', 'debit card', 'creditcard kosten', 'rente rood', 'debetrente', 'kosten betaalpas'] },
  { id: 'belasting', group: 'financieel', name: 'Belasting en boetes', icon: '🧾', dir: 'out', kw: ['belastingdienst', 'cjib', 'centraal justitieel incassobureau', 'boete', 'naheffing', 'parkeerboete', 'rdw boete', 'duo', 'dienst uitvoering onderwijs'] },
  { id: 'creditcard', group: 'financieel', name: 'Creditcard aflossing', icon: '💳', dir: 'out', kw: ['international card services', 'ics', 'icscards', 'creditcard', 'american express', 'amex'] },

  // Overig
  { id: 'contant', group: 'contant', name: 'Contant geld', icon: '💵', dir: 'out', kw: ['geldmaat', 'geldautomaat', 'gea', 'cash withdrawal', 'opname'] },
  { id: 'tikkie-betaald', group: 'personen', name: 'Tikkies betaald', icon: '🤝', dir: 'out', kw: ['tikkie', 'aab inz tikkie', 'betaalverzoek', 'wero betaalverzoek'] },
  { id: 'goededoelen', group: 'goededoelen', name: 'Goede doelen', icon: '❤️', dir: 'out', kw: ['kwf', 'rode kruis', 'unicef', 'artsen zonder grenzen', 'greenpeace', 'wnf', 'wereld natuur fonds', 'amnesty', 'hartstichting', 'nierstichting', 'longfonds', 'alzheimer', 'stichting vluchteling', 'giro555', 'warchild', 'war child', 'plan nederland', 'natuurmonumenten', 'staatsbosbeheer', 'collecte', 'donatie', 'gift'] },
  { id: 'huisdieren', group: 'huisdieren', name: 'Huisdieren', icon: '🐾', kw: ['pets place', 'jumper', 'discus', 'zooplus', 'dierenarts*', 'dierenkliniek', 'dierenspeciaalzaak', 'ranzijn dier', 'petsplace', 'medpets', 'brekz', 'bitiba'] },
  { id: 'opleiding', group: 'opleiding', name: 'Opleiding en cursussen', icon: '🎓', dir: 'out', kw: ['rijschool', 'rijles*', 'cbr', 'cursus*', 'opleiding*', 'studieboeken', 'hogeschool', 'universiteit', 'examen*', 'lesgeld', 'collegegeld', 'studiekosten', 'inholland'] },
  { id: 'overboeking-persoon', group: 'personen', name: 'Betaald aan personen', icon: '👤', dir: 'out', kw: [] },
  { id: 'overig-uitgave', group: 'overig', name: 'Overige uitgaven', icon: '📦', dir: 'out', kw: [] },
  { id: UNCATEGORIZED, group: 'overig', name: 'Nog niet ingedeeld', icon: '❔', dir: 'out', kw: [] },

  // Inkomsten
  { id: 'salaris', group: 'inkomen', name: 'Salaris', icon: '💼', dir: 'in', kw: ['salaris', 'loon', 'tata steel', 'tata steel ijmuiden', 'tata steel nederland', 'salarisbetaling', 'nettoloon', 'blok system supply', 'uitzendbureau', 'randstad', 'tempo team', 'youngcapital', 'olympia', 'adecco', 'start people'] },
  { id: 'vakantiegeld', group: 'inkomen', name: 'Vakantiegeld en bonus', icon: '🌴', dir: 'in', kw: ['vakantiegeld', 'vakantietoeslag', 'dertiende maand', '13e maand', 'eindejaarsuitkering', 'bonus', 'winstuitkering'] },
  { id: 'belasting-terug', group: 'inkomen', name: 'Belastingteruggave en toeslagen', icon: '🏛️', dir: 'in', kw: ['belastingdienst', 'toeslagen', 'zorgtoeslag', 'huurtoeslag', 'teruggaaf', 'teruggave', 'voorlopige aanslag', 'duo'] },
  { id: 'rente', group: 'inkomen', name: 'Rente en dividend', icon: '📈', dir: 'in', kw: ['basic interest', 'credit interest', 'rente', 'interest', 'dividend', 'bonusrente'] },
  { id: 'tikkie-ontvangen', group: 'inkomen', name: 'Tikkies ontvangen', icon: '🤝', dir: 'in', kw: ['tikkie', 'aab inz tikkie', 'betaalverzoek'] },
  { id: 'verkoop', group: 'inkomen', name: 'Verkopen', icon: '🏷️', dir: 'in', kw: ['marktplaats', 'vinted', 'ebay', 'bol com partner', 'catawiki', '2dehands', 'tweedehands'] },
  { id: 'terugbetaling', group: 'inkomen', name: 'Terugbetalingen', icon: '↩️', dir: 'in', kw: [] },
  { id: 'ontvangen-persoon', group: 'inkomen', name: 'Ontvangen van personen', icon: '👤', dir: 'in', kw: [] },
  { id: 'cadeau-ontvangen', group: 'inkomen', name: 'Geld gekregen', icon: '🎁', dir: 'in', kw: ['verjaardag', 'kerstcadeau', 'sinterklaas', 'cadeautje'] },
  { id: 'overig-inkomen', group: 'inkomen', name: 'Overige inkomsten', icon: '💶', dir: 'in', kw: [] },
  { id: UNCATEGORIZED_IN, group: 'inkomen', name: 'Nog niet ingedeeld', icon: '❔', dir: 'in', kw: [] },

  // Overboekingen (tellen niet als uitgave of inkomen)
  { id: 'sparen', group: 'overboeking', name: 'Spaarrekening', icon: '🐷', kw: ['spaarrekening', 'direct sparen', 'vrij sparen', 'spaarrek', 'kwartaalsparen', 'doelsparen'] },
  { id: 'beleggen', group: 'overboeking', name: 'Beleggen (BUX e.d.)', icon: '📊', kw: ['bux', 'bux b v', 'bux zero', 'bux nv', 'degiro', 'flatex', 'trade republic', 'meesman', 'brand new day', 'saxo', 'lynx', 'peaks', 'bitvavo', 'coinbase', 'binance', 'kraken', 'revolut trading', 'abn amro beleggen', 'centraal beheer beleggen', 'semmie', 'look what you could do'] },
  { id: 'eigen-rekening', group: 'overboeking', name: 'Eigen rekening (overig)', icon: '🔁', kw: [] },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export function catInfo(id) {
  return CAT_BY_ID[id] || CAT_BY_ID[UNCATEGORIZED];
}

export function groupOf(catId) {
  return GROUP_BY_ID[catInfo(catId).group];
}

// Hints: woorden die iets zeggen over de soort zaak (bijvoorbeeld "Pizzeria Napoli" of "Hotel Zonneveld").
// Worden pas gebruikt als geen winkelnaam herkend is. Het resultaat is een schatting.
export const HINTS = [
  { category: 'supermarkt', words: ['boodschap*', 'bbq', 'barbecue', 'avondeten', 'gourmet*', 'supermarkt*', 'supermarket*', 'super', 'minimarkt', 'minimarket', 'toko', 'boodschappen', 'groceries', 'grocery', 'carrefour', 'intermarche', 'rewe', 'edeka', 'mercadona', 'conad', 'migros', 'tesco', 'sainsbury*', 'delhaize', 'colruyt', 'kaufland', 'penny', 'netto', 'billa'] },
  { category: 'fastfood', words: ['mac', 'mcd', 'macdonalds', 'kfc*', 'shoarmazaak', 'snack*', 'friet*', 'frites', 'patat*', 'burger*', 'chicken', 'kip', 'foodtruck', 'food truck', 'grillroom', 'doner*', 'kebab*', 'shoarma*', 'pita', 'falafel'] },
  { category: 'restaurant', words: ['restaurant*', 'resto', 'eetcafe', 'eethuis', 'bistro', 'brasserie', 'trattoria', 'osteria', 'ristorante', 'pizza*', 'sushi*', 'ramen', 'noodle*', 'wok', 'thai', 'indian', 'indiaas', 'mexican*', 'taco*', 'tapas', 'grill', 'steak*', 'diner', 'dinner', 'kitchen', 'keuken', 'food', 'foods', 'pannenkoek*', 'pancake*', 'poke', 'dim sum', 'asian', 'aziatisch', 'oriental', 'gastro*', 'eatery', 'eten'] },
  { category: 'versspeciaal', words: ['brood*', 'bakery', 'boulangerie', 'padaria', 'panaderia', 'baeckerei', 'backerei'] },
  { category: 'koffie', words: ['ontbijt', 'brunch', 'koffietje', 'coffee*', 'koffie*', 'espresso*', 'cappuccino', 'lunch*', 'broodje*', 'sandwich*', 'bagel*', 'tea', 'thee', 'tearoom', 'ijs', 'ijssalon', 'gelato*', 'ice cream', 'patisserie', 'cafeteria', 'kantine', 'canteen', 'automaat', 'vending', 'selecta', 'smoothie*', 'juice'] },
  { category: 'kroeg', words: ['drank*', 'drankjes', 'biertjes', 'bier', 'wijn', 'bar', 'pub', 'cafe', 'kroeg', 'bier*', 'beer*', 'brouwerij', 'brewery', 'brewing', 'cocktail*', 'lounge', 'wijnbar', 'wine bar', 'paviljoen', 'strandpaviljoen', 'beachclub', 'beach club', 'nightclub', 'disco*', 'borrel*', 'taverne', 'herberg', 'proeverij'] },
  { category: 'brandstof', words: ['tank*', 'benzine', 'diesel', 'fuel', 'petrol', 'gas station', 'laadpaal', 'laadsessie', 'laden', 'charging', 'charge*', 'ev', 'tankpas'] },
  { category: 'parkeren', words: ['parkeer*', 'parkeren', 'parking', 'parkhaus', 'parcheggio', 'garage parking'] },
  { category: 'ov', words: ['trein', 'train*', 'bus', 'metro', 'tram', 'ferry', 'veerboot', 'veerpont', 'pont', 'rail*', 'ov'] },
  { category: 'taxi', words: ['taxi*', 'cab', 'rideshare', 'scooter*'] },
  { category: 'kleding', words: ['fashion*', 'mode', 'modehuis', 'kleding*', 'clothing', 'apparel', 'jeans', 'denim', 'menswear', 'herenmode', 'boutique', 'streetwear', 'outfit*', 'wear'] },
  { category: 'kapper', words: ['hair*', 'barber*', 'kapper*', 'kapsalon', 'haar*', 'coiffeur', 'coiffure'] },
  { category: 'verzorging', words: ['nagel*', 'nails', 'beauty*', 'schoonheid*', 'cosmetic*', 'cosmetica', 'parfum*', 'perfume*', 'skin*', 'massage*', 'tattoo*', 'piercing*'] },
  { category: 'sportschool', words: ['gym*', 'fitness*', 'sportschool', 'crossfit', 'yoga*', 'pilates', 'boulder*', 'klim*', 'zwembad', 'swim*', 'padel*', 'tennis*', 'squash', 'sportcentrum', 'sportpark', 'sporthal'] },
  { category: 'hobby', words: ['bowlen', 'karten', 'golfen', 'uitje', 'dagje uit', 'escape room', 'laser', 'zoo', 'dierentuin', 'pretpark', 'attractiepark', 'waterpark', 'sauna*', 'wellness*', 'spa', 'thermen', 'museum*', 'expositie', 'tentoonstelling', 'escape*', 'karting', 'bowling', 'lasergam*', 'arcade', 'speelhal', 'minigolf', 'midgetgolf', 'golf*', 'kart*', 'jump*', 'trampoline*', 'paintball', 'skiles', 'surf*', 'kitesurf*', 'zeil*', 'sloep*', 'kano*', 'fiets verhuur', 'fietsverhuur'] },
  { category: 'feest', words: ['kaartje*', 'kaarten', 'feest*', 'huisfeest', 'stadion', 'wedstrijd', 'voetbal', 'party', 'ticket*', 'tickets', 'festival*', 'concert*', 'event*', 'evenement*', 'entree', 'entrance', 'kassa'] },
  { category: 'bioscoop', words: ['bios', 'bioscoopje', 'filmpje', 'netflix avond', 'cinema*', 'bioscoop', 'film*', 'theater*', 'theatre', 'schouwburg', 'musical*', 'comedy', 'cabaret'] },
  { category: 'verblijf', words: ['hotel*', 'hostel*', 'resort*', 'apartment*', 'appartement*', 'apartamento*', 'vakantiepark', 'vakantiehuis', 'bungalow*', 'lodge', 'camping*', 'motel', 'pension', 'guesthouse', 'b b', 'inn', 'suites'] },
  { category: 'vliegen', words: ['airline*', 'airways', 'flight*', 'vlucht*'] },
  { category: 'vakantie', words: ['vakantie*', 'weekend weg', 'weekendje', 'weekend', 'reis', 'reisje', 'trip', 'wintersport', 'ski*', 'stedentrip', 'souvenir*', 'duty free', 'dutyfree', 'excursie*', 'tour', 'tours', 'reisbureau', 'travel*'] },
  { category: 'elektronica', words: ['electronic*', 'elektronica', 'computer*', 'laptop*', 'telefoonwinkel', 'phone*', 'apple', 'gadget*', 'tech'] },
  { category: 'online', words: ['webshop*', 'webwinkel', 'online', 'shop', 'store', 'bestelling', 'order', 'bestelnummer', 'ordernummer', 'www', 'com', 'nl'], dir: 'out', ideal: true },
  { category: 'warenhuis', words: ['bazaar', 'bazar', 'huishoud*', 'woonwinkel', 'warenhuis', 'department store', 'euroshop', 'dollar*', 'kringloop*', 'tweedehands', 'thrift', 'markthal'] },
  { category: 'sportwinkel', words: ['sportwinkel', 'sportshop', 'sports', 'outdoor', 'running', 'bike', 'cycling'] },
  { category: 'boeken', words: ['books', 'book', 'boekwinkel', 'tijdschrift*', 'krant', 'magazine*', 'stripwinkel', 'comics'] },
  { category: 'cadeaus', words: ['primera', 'kerstcadeau*', 'verjaardagscadeau*', 'kraamcadeau*', 'surprise', 'bloemetje', 'flower*', 'florist', 'bloemist', 'bloemen*', 'cadeau*', 'kado*', 'gift*', 'speelgoed*', 'toys', 'toy'] },
  { category: 'inrichting', words: ['meubel*', 'furniture', 'interieur*', 'wonen', 'woonwinkel', 'living', 'beddenwinkel', 'matras*', 'gordijn*', 'verlichting', 'lamp*', 'deco*'] },
  { category: 'klussen', words: ['tuin*', 'bouwmarkt', 'verf*', 'ijzerwaren', 'gereedschap', 'hout*', 'doe het zelf', 'diy', 'hardware'] },
  { category: 'auto', words: ['garage', 'autoservice', 'autobedrijf', 'banden*', 'bandenservice', 'apk', 'car', 'cars', 'auto*', 'wasstraat', 'carwash', 'car wash', 'pechhulp'] },
  { category: 'apotheek', words: ['pharma*', 'farmacia', 'pharmacie', 'apotheek', 'apotheke'] },
  { category: 'zorg', words: ['dental', 'dentist', 'tandarts*', 'kliniek', 'clinic', 'medisch*', 'medical', 'praktijk', 'therapie*', 'therapeut*', 'zorg', 'gezondheid*', 'health*', 'ziekenhuis'] },
  { category: 'opticien', words: ['optiek', 'optical', 'optician', 'brillen*', 'lens', 'lenzen'] },
  { category: 'huisdieren', words: ['dierenwinkel', 'dierenspeciaal*', 'petshop', 'pet shop', 'dierenarts*', 'dierenkliniek', 'trimsalon', 'hondenschool', 'hondenuitlaat*'] },
  { category: 'games', words: ['game*', 'gaming', 'esports', 'console*', 'playstation', 'nintendo', 'xbox'] },
  { category: 'gokken', words: ['casino*', 'loterij*', 'lottery', 'lotto', 'poker', 'bingo', 'wedden', 'sportsbook', 'gokken'] },
  { category: 'abonnement-overig', words: ['abonnement*', 'subscription*', 'membership', 'lidmaatschap*', 'maandbedrag', 'maandelijks', 'monthly', 'jaarabonnement', 'premium', 'contributie'] },
  { category: 'verzekering', words: ['verzekering*', 'insurance', 'assurantie*', 'polis*', 'premie'] },
  { category: 'goededoelen', words: ['donatie*', 'donation*', 'doneren', 'collecte', 'goed doel', 'foundation', 'fonds', 'kerk', 'parochie', 'moskee'] },
  { category: 'opleiding', words: ['school', 'academie', 'academy', 'cursus*', 'course*', 'opleiding*', 'training*', 'workshop*', 'studie*', 'lessen', 'examen*'] },
  { category: 'kostgeld', words: ['kostgeld', 'kost en inwoning', 'huishoudgeld', 'huishoudpot'], dir: 'out' },
  { category: 'huur', words: ['huur', 'rent', 'kamerhuur', 'servicekosten'], dir: 'out' },
  { category: 'cadeau-ontvangen', words: ['verjaardag*', 'jarig', 'cadeau*', 'kado*', 'sinterklaas', 'kerst*', 'gefeliciteerd', 'birthday'], dir: 'in' },
  { category: 'tikkie-ontvangen', words: ['tikkie*', 'betaalverzoek*', 'terug', 'terugbetaling', 'voorgeschoten', 'mijn deel', 'jouw deel', 'deel'], dir: 'in' },
  { category: 'verkoop', words: ['bookmatch', 'verkoop', 'verkocht', 'koper', 'sold'], dir: 'in' },
  { category: 'salaris', words: ['salaris*', 'loon*', 'salary', 'payroll', 'wage*', 'uitbetaling uren', 'uren'], dir: 'in' },
];
