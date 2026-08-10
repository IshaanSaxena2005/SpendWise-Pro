"""Labeled training dataset for SpendWise Pro transaction category classifier.

Categories (8):
    Food, Shopping, Bills, Travel, Entertainment, Health, Fuel, Salary

Each sample is a (description, category_label) tuple.

Diversity focus:
    - Indian merchants / brands (Swiggy, Zomato, BigBasket, DMart, Flipkart, Airtel, Jio, etc.)
    - Regional / Hindi terms (aalu, aloo, paratha, masala, chai, chawal, sabzi, etc.)
    - Common typos and spelling variations (swigy, netflixx, petroll, electicity)
    - Payment patterns: prefixes like UPI/, IMPS/, POS/, -Ref, +Cashback
    - Case variations, numbers (QTY 2, x2, #0421)
    - Amount suffixes ("paid 250", "INR 499")
"""

from __future__ import annotations

import random
from typing import List, Tuple

# -----------------------------------------------------------------------------
# Category seed corpora (each inner list = raw phrases for that category)
# -----------------------------------------------------------------------------

FOOD_RAW = [
    # Indian food items
    "potato", "aloo", "alu", "masala potato", "aloo paratha", "paneer tikka",
    "chicken biryani", "veg biryani", "hyderabadi biryani", "dum biryani",
    "samosa", "kachori", "jalebi", "gulab jamun", "rasgulla", "rasmalai",
    "chole bhature", "rajma chawal", "kadai paneer", "shahi paneer", "paneer butter masala",
    "dal makhani", "dal tadka", "sarson da saag", "makki di roti", "naan", "roti",
    "chana masala", "chole", "pav bhaji", "vada pav", "dabeli", "sev puri", "bhel puri",
    "paani puri", "pani puri", "dahi puri", "ragda patties", "kachori sabzi",
    "chai", "tea", "coffee", "cafe coffee day", "ccd", "starbucks", "costa coffee",
    "lassi", "chass", "nimbu pani", "fresh juice", "sugarcane juice",
    "tandoori chicken", "butter chicken", "chicken 65", "fish curry", "prawns fry",
    "egg curry", "egg bhurji", "boiled eggs", "omelette",
    "idli", "dosa", "vada", "sambar", "rasam", "uttapam", "pongal",
    "thali", "lunch thali", "dinner buffet", "lunch buffet",
    "paratha", "mooli paratha", "gobhi paratha", "methi paratha", "pyaaz paratha",
    "sabzi", "vegetable curry", "mixed veg", "paneer lababdar", "paneer pasanda",
    "lunch", "dinner", "breakfast", "snacks", "tiffin", "office lunch",
    "mcdonalds", "mcdonald", "mc donalds", "burger king", "kfc", "subway",
    "dominos", "domino's", "pizza hut", "pizza", "burger", "fries", "mcfurry",
    "swiggy", "swigy", "swigyy", "zomato", "zomat0", "foodpanda", "faasos",
    "box8", "freshmenu", "eatsure", "dunzo food",
    "restaurant", "hotel", "dining", "family dinner", "catering",
    "bakery", "biscuit", "bread", "cake", "pastry", "cookies", "pav",
    "grocery", "kirana", "general store", "ration", "d mart", "dmart", "dmart grocery",
    "bigbasket", "big basket", "grofers", "blinkit", "zepto", "instamart",
    "rice bag", "atta", "wheat flour", "sugar", "oil", "dal", "masala packet",
    "vegetables", "fruits", "apple", "banana", "orange", "grapes", "watermelon",
    "milk", "dahi", "curd", "butter", "ghee", "cheese slice", "paneer block",
    "chocolates", "cadbury", "kitkat", "munch", "perk", "lays", "kurkure", "bingo",
    "icecream", "ice cream", "amul ice cream", "kwality walls", "vadilal",
    "noodles", "maggi", "yippee", "pasta", "soup", "oats", "cornflakes",
    "biryani house", "paradise biryani", "bawarchi", "absolute barbecue", "barbeque nation",
    "haldiram", "bikanervala", "karachi bakery", " Karachi biscuit",
    "sandwich", "club sandwich", "paneer sandwich", "veg sandwich",
    "paniyaram", "medu vada", "masala dosa", "rava dosa", "set dosa",
    "khichdi", "kadhi chawal", "baingan bharta", "bhindi masala", "lauki ki sabzi",
    # typos
    "aalu paratha", "paneer takka", "briyani", "samosaa", "chaai", "tanduri",
    "sabzi", "veg biriyani", "coffe", "resturant", "lunchh", "dinnr",
    # payment-style variations
    "UPI-SWIGGY-8291", "UPI-ZOMATO-ORDER412", "POS DMART GROCERY 2499",
    "UPI CCD SOHNA ROAD", "UPI-BIGBASKET-4821", "PAYTM ZOMATO FOOD",
    "IMPS PIZZA HUT 599", "Swiggy Instamart grocery",
    "Biryani paid 320", "INR 499 Zomato dinner", "Groceries - BigBasket 1250",
]

SHOPPING_RAW = [
    "amazon", "amazon shopping", "amazon shoes", "amazon electronics",
    "flipkart", "flipkart fashion", "flipkart big billion", "myntra", "ajio",
    "snapdeal", "meesho", "nykaa", "purplle", "pepperfry", "urban ladder",
    "clothing", "fashion", "t shirt", "shirt", "trousers", "jeans", "denim",
    "kurti", "kurta", "saree", "lehenga", "salwar suit", "dupattas", "ethnic wear",
    "shoes", "sneakers", "sports shoes", "nike", "adidas", "puma", "reebok", "bata",
    "sandals", "flip flops", "crocs", "woodland shoes",
    "laptop", "macbook", "dell laptop", "hp laptop", "lenovo thinkpad",
    "mobile phone", "iphone", "samsung", "xiaomi", "redmi", "oneplus", "realme",
    "smartwatch", "apple watch", "fi tbit", "noise watch", "boat watch",
    "headphones", "airpods", "boat rockerz", "sony wh", "jbl headphones",
    "bluetooth speaker", "alexa", "echo dot", "google home",
    "furniture", "sofa", "bed", "table", "chair", "wardrobe", "mattress",
    "home decor", "curtains", "wall clock", "painting", "lamp", "rug",
    "kitchen items", "cooker", "mixer grinder", "juicer", "tupperware", "milton",
    "books", "amazon books", "flipkart books", "stationery", "notebooks", "pen",
    "beauty", "makeup", "lipstick", "foundation", "sunscreen", "face wash",
    "lakme", "maybelline", "loreal", "the ordinary", "minimalist",
    "bags", "backpack", "laptop bag", "handbag", "sling bag", "wildcraft", "skybags",
    "jewellery", "earrings", "necklace", "bangles", "tanishq", "kalyan jewellers",
    "toys", "games", "puzzle", "lego", "barbie", "hot wheels",
    "sports", "cricket kit", "football", "basketball", "badminton racket", "yonex",
    "gym equipment", "dumbbells", "yoga mat", "treadmill",
    "appliances", "fridge", "washing machine", "microwave", "tv", "led tv", "ac",
    "hair dryer", "straightener", "trimmer", "philips trimmer", "mi trimmer",
    "sunglasses", "lenskart", "john jacobs", "rayban", "vogue",
    "watches", "titan", "fastrack", "casio", "fossil", "apple watch ultra",
    "socks", "innerwear", "underwear", "jockey", "hanes",
    "school uniform", "project materials", "craft items",
    # typos
    "amzon", "flipkrrt", "mynttra", "shooes", "tshirt", "jeens",
    "lappy", "mobille", "hearphones", "lipstik",
    # payment style
    "UPI-AMAZON-IN-4812", "UPI MYNTRA 3499", "POS FLIPKART FASHION",
    "UPI NYKAA ORDER-8214", "UPI-Pepperfry-furniture",
    "Shoes purchased Nike 3999", "INR 12990 Laptop bag",
    "Amazon order hair dryer 1499", "Nykaa lipstick combo 799",
]

BILLS_RAW = [
    "electricity bill", "bijli bill", "power bill", "electricity payment",
    "electric bill", "bijli ka bill", "tamilnadu electricity", "mseb", "mahadiscom",
    "adani electricity", "tata power", "torrent power",
    "water bill", "jal bill", "mc water tax", "water supply",
    "gas bill", "gas cylinder", "hp gas", "indane", "bharat gas", "png bill",
    "internet bill", "wifi bill", "broadband bill", "broadband recharge",
    "act fibernet", "excitel", "you broadband", "hayai", "combo plan",
    "airtel", "airtel postpaid", "airtel recharge", "airtel bill",
    "jio", "jio recharge", "jio postpaid", "jio fiber",
    "vodafone", "vi", "vodafone idea", "idea cellular",
    "bsnl", "bsnl recharge", "bsnl landline",
    "dth", "dish tv", "tata sky", "tata play", "airtel dth", "videocon d2h", "sun direct",
    "rent", "house rent", "office rent", "rent payment", "advance rent", "security deposit",
    "emi", "loan emi", "home loan emi", "car loan emi", "personal loan emi",
    "insurance", "health insurance", "life insurance", "term insurance", "car insurance",
    "bike insurance", "two wheeler insurance", "lic premium", "hdfc life", "icici prudential",
    "max life", "tata aig", "bajaj allianz",
    "mobile recharge", "prepaid recharge", "top up", "recharge plan 299",
    "subscription", "yearly subscription", "annual subscription", "quarterly plan",
    "tax", "property tax", "house tax", "gst payment", "income tax",
    "maintenance", "society maintenance", "apartment maintenance", "monthly maintenance",
    "cable bill", "cable tv", "local cable", "siti cable", "hathway",
    "school fees", "tuition fees", "college fees", "class fees", "coaching fees",
    "exam fees", "application fees", "certificate fees",
    # typos
    "electicity bill", "eletricity", "watter bill", "interenet", "airtel bil",
    "jio rechage", "gas bil", "rents", "insurence", "maintaince",
    # payment style
    "UPI AIRTEL POSTPAID 899", "UPI-JIOfiber-1299", "POS TATA POWER 2450",
    "Electricity via Paytm 1580", "House rent Gpay 18000", "LIC premium HDFC 3200",
    "PNG bill 780", "Water tax MC 320", "Society maintenance 4500",
]

TRAVEL_RAW = [
    "uber", "uber ride", "uber pool", "uber go", "uber auto",
    "ola", "ola ride", "ola auto", "ola cab", "ola prime",
    "rapido", "rapido bike", "rapido auto",
    "taxi", "cab", "auto rickshaw", "auto", "rickshaw",
    "flight ticket", "flight", "air ticket", "air india", "indigo", "go first", "spicejet",
    "akasa air", "vistara", "emirates", "qatar airways",
    "train ticket", "railway", "irctc", "rail ticket", "rajdhani", "shatabdi", "vande bharat",
    "garib rath", "duronto", "superfast train", "express train",
    "metro", "delhi metro", "mumbai metro", "metro card recharge", "noida metro",
    "bus ticket", "bus", "state bus", "volvo", "sleeper bus", "ac bus",
    "redbus", "abhi bus", "makemytrip", "goibibo", "yatra", "cleartrip", "expedia",
    "hotel booking", "hotel", "resort", "stay", "oyo", "treebo", "fab hotels",
    "trivago", "booking.com", "agoda", "airbnb",
    "fuel", "petrol", "diesel", "cn g",
    "highway toll", "toll tax", "toll plaza", "fastag", "fast tag recharge",
    "parking", "parking charges", "valet parking",
    "visa fees", "passport fees", "travel insurance",
    "luggage", "baggage", "baggage charges", "extra luggage",
    "trip", "vacation", "holiday", "tour", "travel package", "goa trip", "manali trip",
    "bike on rent", "car on rent", "zoomcar", "revv", "mychoize", "self drive car",
    "helicopter ride", "ferry", "boat ride", "cruise",
    # typos
    "uberr", "oola", "taxi ridee", "fligt", "air tikcket",
    "train tiket", "metr0", "hotal", "petroll", "tol tax",
    # payment style
    "UPI-UBER-242", "UPI-OLA-812", "POS INDIRA GANDHI INT 4500",
    "IRCTC 3A ticket 1290", "UPI-OYO room 2499", "MakeMyTrip flight 9850",
    "UPI-RAPIDO bike taxi-89", "Zoom car weekend booking 3499",
    "Toll plaza 150", "Parking charges 60",
    "Uber ride home 230", "Delhi metro card recharge 500",
]

ENTERTAINMENT_RAW = [
    "netflix", "netflix subscription", "netflix plan", "netflixx", "netfix",
    "spotify", "spotify premium", "music subscription", "sufjan stevens concert",
    "prime video", "amazon prime", "prime membership", "amazon prime video",
    "disney plus", "disney+", "hotstar", "disney hotstar", "hbo max",
    "jiocinema", "sony liv", "zee5", "mx player", "alt balaji", "eros now", "ullu",
    "movie ticket", "movie", "pvr", "inox", "cinepolis", "wave cinemas", "miraj cinema",
    "theatre", "cinema hall", "imax", "3d movie", "blockbuster",
    "concert", "music festival", "sunburn", "nh7 weekender", "lollapalooza",
    "stand up comedy", "standup", "comedy show", "zakir khan", "biswa kalyan rath",
    "comedy club", "open mic", "poetry slam",
    "gaming", "playstation", "ps5", "ps4", "ps plus", "xbox", "game pass",
    "steam", "epic games", "gta", "cyberpunk", "minecraft", "valorant",
    "pubg", "bgmi", "free fire", "in app purchase", "diamond top up", "uc purchase",
    "arcade", "gaming zone", "bowling", "billiards", "snooker", "pool table",
    "escape room", "theme park", "amusement park", "wonderla", "imagica", "adlabs imagica",
    "zoo", "aquarium", "museum", "art gallery", "exhibition", "trade fair",
    "sports event", "ipl ticket", "ipl", "cricket match", "football match", "wwe",
    "f1", "formula 1", "badminton match", "tennis match",
    "karaoke", "club", "pub", "lounge", "party", "d j night", "new year party",
    "board games", "monopoly", "chess tournament", "cards party",
    # typos
    "netflx", "hotstar", "spotiffy", "moviee", "pvr cinemaa",
    "conncert", "ps5 gamee", "gamng", "stand up commedy",
    # payment style
    "UPI NETFLIX MONTHLY 649", "UPI-SpotifyPremium-119", "POS PVR 4DX 1200",
    "Amazon Prime yearly 1499", "Hotstar yearly 1499",
    "UPI IPL ticket x2 3600", "Comedy club entry 499",
    "Escape room team 2500", "Wonderla tickets 2499",
    "Bowling + dinner 1500", "Karaoke night 899",
]

HEALTH_RAW = [
    "apollo pharmacy", "apollo", "medplus", "netmeds", "pharmeasy", "1mg", "tata 1mg",
    "medicine", "medicines", "pharmacy", "medical store", "medical bill",
    "doctor", "doctor visit", "doctor consultation", "physician", "specialist",
    "hospital", "fortis hospital", "apollo hospital", "aiims", "max hospital",
    "clinic", "dental clinic", "dermatologist", "ent doctor", "cardiologist",
    "blood test", "lab test", "thyrocare", "lal path", "srl diagnostics", "healthians",
    "cbc test", "lipid profile", "hba1c", "blood sugar", "covid test", "rtpcr",
    "ct scan", "mri", "x ray", "ultrasound", "ecg", "echo", "endoscopy",
    "surgery", "operation", "dental treatment", "root canal", "teeth cleaning",
    "spectacles", "glasses", "contact lenses", "bausch lomb", "lens solution",
    "vitamin", "supplements", "multivitamin", "calcium", "vitamin d3", "fish oil",
    "whey protein", "gym supplement", "mass gainer", "creatine", "protein powder",
    "gym membership", "gym fees", "fitness", "cult.fit", "cultpass", "anytime fitness",
    "yoga class", "zumba", "dance class", "fitness class", "crossfit",
    "spa", "massage", "therapy", "physiotherapy", "chiropractor",
    "ayurvedic", "patanjali", "dabur", "himalaya", "baidyanath", "ayurvedic medicine",
    "homeopathy", "homeopathic", "sbl", "dr. reckeweg", "schwabe",
    "vaccine", "vaccination", "covid vaccine", "covaxin", "covishield", "flu shot",
    "baby products", "diapers", "huggies", "pampers", "baby oil", "baby wipes",
    "hand wash", "sanitizer", "dettol", "savlon", "lifebuoy", "oral care",
    "toothpaste", "toothbrush", "colgate", "sensodyne", "mouthwash",
    "sanitary pads", "whisper", "stayfree", "kotex", "tampons", "menstrual cup",
    # typos
    "apollo pharmasy", "medicens", "docter", "hospitl", "blod test",
    "dentist vist", "vitaminns", "suppliments",
    # payment style
    "UPI-APOLLO-PHMX-482", "1mg medicines order 1250", "UPI Thyrocare test-1799",
    "Doctor consultation 800", "POS Fortis hospital 25000", "Dental root canal 8500",
    "Cult pass elite 1999", "UPI 1mg order 450",
    "Physiotherapy 10 sessions 5000", "Apollo hospital deposit 50000",
]

FUEL_RAW = [
    "petrol", "petrol pump", "petrol fill", "petrol refill", "petrol bunk",
    "diesel", "diesel fill", "diesel pump", "petroleum",
    "indian oil", "indian oil petrol pump", "ioc", "iocl",
    "bharat petroleum", "bpcl", "hp petrol pump", "hindustan petroleum",
    "shell petrol", "shell", "essar", "nayara", "reliance petrol", "reliance jio bp",
    "cng fill", "cng pump", "compressed natural gas", "png",
    "ev charging", "charging station", "electric vehicle charging", "tesla supercharger",
    "tata power charging", "ather grid", "bolt earth",
    "fuel", "fuel bill", "fuel expense", "fuel recharge",
    "oil change", "engine oil", "servo", "castrol", "mobil", "shell helix",
    "lubricants", "gear oil", "coolant", "washer fluid",
    "car wash", "bike wash", "detailing", "foam wash", "ceramic coating",
    "car service", "bike service", "scheduled service", "general service",
    "tyre", "new tyres", "mrf tyres", "apollo tyres", "ceat", "goodyear", "bridgestone",
    "wheel alignment", "wheel balancing", "puncture", "tube repair",
    "battery", "exide", "amaron", "luminous", "battery replacement",
    "car accessories", "car polish", "dashboard mat", "seat cover", "helmet",
    "degreaser", "shampoo", "car wax",
    # typos
    "petroll", "petrol pumpp", "desel", "diseal", "indian oil petroll",
    "cng fillup", "oil chage", "tyer", "batery",
    # payment style
    "UPI INDIANOIL-8471", "POS HPCL PUMP 3200", "UPI-BharatPetro-2150",
    "Shell v-power 4000", "CNG fill 550", "EV charging Tata power 120",
    "Car service maruti 5500", "MRF tyres set 28000",
    "Petrol full tank 4200", "Diesel fill Tata Nexon 3800",
    "Engine oil + filter 1800", "Exide battery replacement 6500",
]

SALARY_RAW = [
    "salary", "salary credit", "monthly salary", "net salary", "gross salary",
    "income", "monthly income", "earning", "earnings",
    "paycheck", "pay check", "payroll", "hr payroll",
    "freelance", "freelance income", "freelancing", "contract payment", "upwork",
    "fiverr", "guru", "peopleperhour", "contractor", "consulting fees",
    "consultancy", "consultant payment", "professional fees",
    "business income", "shop income", "business revenue", "partnership share",
    "dividend", "stocks", "stock market", "share market", "mutual fund", "mf",
    "sip", "sip payment", "monthly sip", "hdfc sip", "icici sip", "axis sip",
    "fixed deposit", "fd", "fd interest", "rd", "recurring deposit",
    "interest", "savings interest", "interest credit",
    "bonus", "performance bonus", "annual bonus", "joining bonus", "retention bonus",
    "incentive", "commission", "sales commission", "referral bonus",
    "reimbursement", "travel reimbursement", "food reimbursement", "expense claim",
    "lta", "leave travel allowance", "hra", "conveyance allowance",
    "gratuity", "pf", "provident fund", "epf", "pension",
    "royalty", "book royalty", "music royalty", "content creator", "youtube",
    "sponsorship", "brand deal", "affiliate income", "influencer",
    "stipend", "internship", "internship stipend", "scholarship",
    "gift", "gift amount", "birthday gift", "donation", "prize", "cash prize",
    "rent received", "rental income", "subtenant income",
    "refund", "tax refund", "it refund", "reversal", "cashback", "reward",
    "p2p transfer", "friend transfer", "family transfer", "loan given", "loan received",
    "maturity", "insurance maturity", "policy maturity", "bond",
    # typos
    "salry", "salry credit", "freelence", "freelanc e", "bonous", "sip paymnt",
    "dvidend", "interst", "reimburssment", "comission",
    # payment style
    "NEFT-SALARY-ACME-202403", "IMPS FREELANCE PAYMENT 45000",
    "UPI UPWORK 85000", "HDFC SALARY CREDIT 125000",
    "FD Interest credit 4820", "IT Refund 12500",
    "Dividend TCS 2100", "Rental income tenant 35000",
    "Bonus Q1 FY24 50000", "Consultancy retainer 30000",
]

# -----------------------------------------------------------------------------
# Augmentation helpers
# -----------------------------------------------------------------------------

NOISE_PREFIXES = [
    "", "", "", "",  # bias toward the raw phrase
    "UPI/", "UPI-", "UPI ",
    "POS ", "POS-", "IMPS-", "NEFT/", "NEFT ",
    "Paytm-", "Paytm ", "GPay ", "Google Pay: ", "PhonePe-", "PhonePe ",
    "UPI ID ", "Ref #", "ORDER #", "Order:",
    "Paid ", "Pay: ", "Paid via UPI ", "Payment to ",
    "Purchase: ", "Spent ", "Debit ", "Credit ",
]

NOISE_SUFFIXES = [
    "", "", "", "",  # bias toward the raw phrase
    " paid 250", " paid 499", " paid 899", " paid 1599", " paid 3299",
    " 499", " 1299", " 2999", " INR 699", " INR 1799",
    " x1", " x2", " x3", " QTY 2", " #0421",
    " - ref", " order", " invoice", " slip", " receipt",
    " - success", " *", " ...",
]

TYPO_PROB = 0.08  # per-phrase typo injection probability


def _inject_typo(phrase: str, rng: random.Random) -> str:
    if len(phrase) < 5:
        return phrase
    if rng.random() > TYPO_PROB:
        return phrase
    chars = list(phrase)
    idx = rng.randint(1, len(chars) - 2)
    op = rng.choice(["repeat", "delete", "swap", "nearby"])
    if op == "repeat":
        chars.insert(idx, chars[idx])
    elif op == "delete":
        del chars[idx]
    elif op == "swap":
        chars[idx], chars[idx + 1] = chars[idx + 1], chars[idx]
    elif op == "nearby":
        nearby_map = str.maketrans("qwsazxerfdcvbgtnhymju,ki.lo/p", "aqwzsxedcrfvtgbyhnujmik,ol.p/")
        rep = chars[idx].translate(nearby_map)
        if rep:
            chars[idx] = rep
    return "".join(chars)


def _augment(phrase: str, rng: random.Random) -> str:
    """Apply prefix, suffix, typo, and casing noise to produce a realistic variant."""
    prefix = rng.choice(NOISE_PREFIXES)
    suffix = rng.choice(NOISE_SUFFIXES)
    phrase = _inject_typo(phrase, rng)
    # casing variants
    case_roll = rng.random()
    if case_roll < 0.55:
        out = phrase
    elif case_roll < 0.75:
        out = phrase.lower()
    elif case_roll < 0.88:
        out = phrase.upper()
    elif case_roll < 0.95:
        out = phrase.title()
    else:
        # swap case of a random letter
        char_list = list(phrase)
        hit = rng.randrange(len(char_list))
        char_list[hit] = char_list[hit].swapcase()
        out = "".join(char_list)
    return f"{prefix}{out}{suffix}"


def build_dataset(seed: int = 42, per_category_target: int = 250) -> List[Tuple[str, str]]:
    """Build a balanced augmented dataset of ~2000 samples (8 categories * 250)."""
    rng = random.Random(seed)
    raw_buckets = {
        "Food": FOOD_RAW,
        "Shopping": SHOPPING_RAW,
        "Bills": BILLS_RAW,
        "Travel": TRAVEL_RAW,
        "Entertainment": ENTERTAINMENT_RAW,
        "Health": HEALTH_RAW,
        "Fuel": FUEL_RAW,
        "Salary": SALARY_RAW,
    }

    samples: List[Tuple[str, str]] = []
    for label, phrases in raw_buckets.items():
        # start with every raw phrase once (keeps canonical forms)
        bucket: List[str] = list(phrases)
        # augment until target count
        while len(bucket) < per_category_target:
            base = rng.choice(phrases)
            variant = _augment(base, rng)
            if variant not in bucket:
                bucket.append(variant)
        for phrase in bucket:
            samples.append((phrase, label))

    # shuffle
    rng.shuffle(samples)
    return samples


DATASET = build_dataset()

if __name__ == "__main__":
    counts: dict = {}
    for _, label in DATASET:
        counts[label] = counts.get(label, 0) + 1
    print(f"Total samples: {len(DATASET)}")
    for label, count in counts.items():
        print(f"  {label}: {count}")
