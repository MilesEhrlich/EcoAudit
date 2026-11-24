/* ── Expanded brand database ── */
const brandData = {
  patagonia: {
    name: 'Patagonia',
    type: 'Outdoor Apparel · B Corp Score 151.4 · Good On You: Good',
    grade: 'A', gradeClass: 'grade-a',
    initial: 'P', gradientStart: '#52B788', gradientEnd: '#1B4332',
    metrics: [
      { name: 'Carbon & Climate',           score: 84, color: '#52B788' },
      { name: 'Supply Chain Transparency',  score: 88, color: '#74C69D' },
      { name: 'Labour Rights',              score: 78, color: '#74C69D' },
      { name: 'Material Sustainability',    score: 92, color: '#52B788' },
      { name: 'Packaging & Waste',          score: 85, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'B Corp certified — Score <strong>151.4</strong> (median 50.9) · Re-certified 2023 via Holdfast Collective · Source: B Lab Global' },
      { status: 'verified', text: '98% recycled polyester, 94% recycled nylon (Fall 2025) — <strong>Verified</strong> bluesign® &amp; Fair Trade Certified factories' },
      { status: 'verified', text: 'SBTi-verified targets: −80% Scope 1&amp;2, −55% Scope 3 by 2030; net-zero by 2040 · Source: Patagonia Impact Report' },
      { status: 'partial',  text: '2025 Impact Report self-discloses: <strong>insufficient absolute emissions reduction progress</strong> to date — rare corporate transparency' },
    ],
    source: 'B Lab Global · Good On You · Patagonia 2025 Impact Report',
  },
  hm: {
    name: 'H&M',
    type: 'Fast Fashion · Good On You: Not Good Enough (Jan 2026)',
    grade: 'D', gradeClass: 'grade-d',
    initial: 'H', gradientStart: '#FF7043', gradientEnd: '#BF360C',
    metrics: [
      { name: 'Carbon & Climate',           score: 30, color: '#EF9A9A' },
      { name: 'Supply Chain Transparency',  score: 25, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 35, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 28, color: '#EF9A9A' },
      { name: 'Packaging & Waste',          score: 38, color: '#FFCC80' },
    ],
    claims: [
      { status: 'negative', text: 'Good On You downgraded to <strong>"Not Good Enough"</strong> across all three pillars — Planet, People, Animals (Jan 2026)' },
      { status: 'negative', text: '"Conscious Collection" — <strong>Misleading per Norway court &amp; EU investigation</strong>; US class-action also filed' },
      { status: 'negative', text: 'GHG emissions <strong>rose 6%</strong> in 2024 (5.7 Mt CO₂e vs 5.3 Mt in 2023) despite climate pledges · Source: H&M Sustainability Report' },
      { status: 'negative', text: 'Living wage — <strong>No evidence</strong> of payment across full supply chain per Good On You 2026 review' },
    ],
    source: 'Good On You (Jan 2026) · Impakter · H&M 2024 Sustainability Report',
  },
  apple: {
    name: 'Apple',
    type: 'Consumer Electronics · MSCI BBB · Sustainalytics 16.9 (Low Risk)',
    grade: 'B+', gradeClass: 'grade-b',
    initial: 'A', gradientStart: '#607D8B', gradientEnd: '#37474F',
    metrics: [
      { name: 'Carbon & Climate',           score: 78, color: '#90CAF9' },
      { name: 'Supply Chain Transparency',  score: 64, color: '#90CAF9' },
      { name: 'Labour Rights',              score: 62, color: '#90CAF9' },
      { name: 'Material Sustainability',    score: 73, color: '#64B5F6' },
      { name: 'Packaging & Waste',          score: 82, color: '#42A5F5' },
    ],
    claims: [
      { status: 'verified', text: 'Corporate operations <strong>carbon neutral since 2020</strong>; Apple Watch Series 9 = first carbon-neutral product (Sept 2023) · Source: Apple EPR' },
      { status: 'verified', text: '300+ suppliers on 100% renewable energy; &gt;95% packaging fibre-based &amp; recycled — <strong>Verified</strong> in 2024 Environmental Progress Report' },
      { status: 'verified', text: 'MSCI ESG: <strong>BBB (Average)</strong> · Sustainalytics: <strong>16.9 — Low Risk</strong> · EPEAT Gold (flagship products)' },
      { status: 'negative', text: 'Labour rights — <strong>Ongoing concerns</strong>: investor-led workers\' rights assessment 2023; store unionisation interference allegations' },
    ],
    source: 'MSCI · Sustainalytics · Apple 2024 Environmental Progress Report',
  },
  nike: {
    name: 'Nike',
    type: 'Sportswear · Good On You: It\'s a Start · MSCI BB',
    grade: 'C+', gradeClass: 'grade-c',
    initial: 'N', gradientStart: '#FF7043', gradientEnd: '#D84315',
    metrics: [
      { name: 'Carbon & Climate',           score: 58, color: '#FFF176' },
      { name: 'Supply Chain Transparency',  score: 48, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 44, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 62, color: '#FFF176' },
      { name: 'Packaging & Waste',          score: 60, color: '#FFF176' },
    ],
    claims: [
      { status: 'partial',  text: 'Good On You: <strong>"It\'s a Start"</strong> overall; People sub-rating: <strong>"Not Good Enough"</strong> (Jan 2026) · Source: Good On You' },
      { status: 'partial',  text: '"Move to Zero": 96% renewable electricity in own operations (FY24) — but <strong>Scope 3 supply chain targets unverified</strong>' },
      { status: 'negative', text: 'Xinjiang cotton — <strong>Insufficient steps</strong> taken to remediate Uyghur forced labour links · Source: Good On You 2026' },
      { status: 'verified', text: 'MSCI: <strong>BB</strong> · Sustainalytics: <strong>18.7 (Medium Risk)</strong> · Nike Grind take-back programme — <strong>Verified</strong>' },
    ],
    source: 'Good On You (Jan 2026) · MSCI · Sustainalytics · Nike FY24 Sustainability Data',
  },
  eileenfisher: {
    name: 'Eileen Fisher',
    type: 'Sustainable Fashion · B Corp Score 109.4 · SBTi Exceeded',
    grade: 'A-', gradeClass: 'grade-a',
    initial: 'E', gradientStart: '#8D6E63', gradientEnd: '#4E342E',
    metrics: [
      { name: 'Carbon & Climate',           score: 82, color: '#A5D6A7' },
      { name: 'Supply Chain Transparency',  score: 90, color: '#52B788' },
      { name: 'Labour Rights',              score: 76, color: '#74C69D' },
      { name: 'Material Sustainability',    score: 85, color: '#52B788' },
      { name: 'Packaging & Waste',          score: 78, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'B Corp score <strong>109.4</strong> — all-time brand high; 4th recertification 2024; 10 consecutive years as B Corp · Source: B Lab Global' },
      { status: 'verified', text: 'SBTi Scope 3: <strong>−51% achieved by 2023</strong> vs −25% target — more than doubled the goal · Source: Eileen Fisher press release' },
      { status: 'verified', text: '100% Tier 1 &amp; 2 supply chain traced &amp; published on Open Supply Hub — <strong>Verified transparency</strong>' },
      { status: 'verified', text: 'Certifications: Fair Trade Certified, GOTS organic cotton, Tencel Lyocell, Responsible Wool Standard — <strong>All independently verified</strong>' },
    ],
    source: 'B Lab Global · Eileen Fisher Sustainability Report 2024',
  },
  organicvalley: {
    name: 'Organic Valley',
    type: 'Organic Dairy Co-op · USDA Organic (Oregon Tilth) · Farmer-Owned',
    grade: 'A-', gradeClass: 'grade-a',
    initial: 'O', gradientStart: '#66BB6A', gradientEnd: '#2E7D32',
    metrics: [
      { name: 'Carbon & Climate',           score: 70, color: '#A5D6A7' },
      { name: 'Supply Chain Transparency',  score: 80, color: '#74C69D' },
      { name: 'Labour Rights',              score: 82, color: '#52B788' },
      { name: 'Material Sustainability',    score: 88, color: '#52B788' },
      { name: 'Packaging & Waste',          score: 65, color: '#A5D6A7' },
    ],
    claims: [
      { status: 'verified', text: 'USDA Certified Organic — certified by <strong>Oregon Tilth</strong> (accredited NOP certifier) across all products · Source: organicvalley.coop/certifications' },
      { status: 'verified', text: '100% renewable electricity for all owned facilities — <strong>Verified</strong> · 1,600+ member farms' },
      { status: 'verified', text: 'Carbon Insetting Program: 65 farms, 79 practices (solar, composting, agroforestry) — <strong>Active &amp; tracked</strong> · Source: 2025 Impact Report' },
      { status: 'partial',  text: 'Not B Corp certified — <strong>common misconception</strong>; farmer co-op governance is distinct from B Corp requirements' },
    ],
    source: 'Organic Valley Certifications Page · 2025 Impact Report',
  },
  loreal: {
    name: "L'Oréal",
    type: "Beauty · MSCI AA · Sustainalytics 20.1 (Medium Risk)",
    grade: 'B', gradeClass: 'grade-b',
    initial: 'L', gradientStart: '#AB47BC', gradientEnd: '#6A1B9A',
    metrics: [
      { name: 'Carbon & Climate',           score: 65, color: '#CE93D8' },
      { name: 'Supply Chain Transparency',  score: 60, color: '#CE93D8' },
      { name: 'Labour Rights',              score: 70, color: '#BA68C8' },
      { name: 'Material Sustainability',    score: 63, color: '#CE93D8' },
      { name: 'Packaging & Waste',          score: 68, color: '#BA68C8' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI ESG: <strong>AA</strong> · Sustainalytics: <strong>20.1 (Medium Risk)</strong> — top 10% in Personal Products sub-category · Source: Sustainalytics' },
      { status: 'partial',  text: 'Leaping Bunny — <strong>Parent brand NOT certified</strong>: sells in mainland China (requires regulatory testing); Garnier, NYX &amp; Urban Decay ARE certified' },
      { status: 'verified', text: 'FTSE Diversity &amp; Inclusion Index 2025 — ranked <strong>No. 4 globally</strong> · Target: −50% carbon emissions by 2030' },
      { status: 'negative', text: 'Animal testing: L\'Oréal banned internal testing in 1989 but <strong>cannot claim cruelty-free</strong> due to China retail regulatory requirements' },
    ],
    source: 'MSCI · Sustainalytics · Leaping Bunny database · Ethical Elephant (2025)',
  },
  fairphone: {
    name: 'Fairphone',
    type: 'Consumer Electronics · B Corp 136.8 · EcoVadis Platinum 2024',
    grade: 'A', gradeClass: 'grade-a',
    initial: 'F', gradientStart: '#26A69A', gradientEnd: '#004D40',
    metrics: [
      { name: 'Carbon & Climate',           score: 85, color: '#80CBC4' },
      { name: 'Supply Chain Transparency',  score: 90, color: '#4DB6AC' },
      { name: 'Labour Rights',              score: 88, color: '#26A69A' },
      { name: 'Material Sustainability',    score: 82, color: '#4DB6AC' },
      { name: 'Packaging & Waste',          score: 80, color: '#80CBC4' },
    ],
    claims: [
      { status: 'verified', text: 'B Corp score <strong>136.8</strong> — nearly 3× the 50.9 median · EcoVadis <strong>Platinum 2024</strong>: top 1% of 114,000 companies audited' },
      { status: 'verified', text: 'GHG emissions cut <strong>48% since 2022</strong> (target was 5%) — vastly exceeded · SBTi: net-zero by 2045 · Source: Fairphone 2024 Impact Report' },
      { status: 'verified', text: 'Living wage bonuses: <strong>$1M+ paid to 20,042 supply chain workers</strong> · iFixit repairability score 10/10 for Fairbuds' },
      { status: 'verified', text: 'Won <strong>GLOMO Award for Climate Innovation 2024</strong> &amp; King Willem I Prize for Sustainable Entrepreneurship 2024' },
    ],
    source: 'B Lab Global · EcoVadis · Fairphone 2024 Impact Report · iFixit',
  },
  zara: {
    name: 'Zara (Inditex)',
    type: 'Fast Fashion · Good On You: Not Good Enough · No independent certification',
    grade: 'D', gradeClass: 'grade-d',
    initial: 'Z', gradientStart: '#FF7043', gradientEnd: '#BF360C',
    metrics: [
      { name: 'Carbon & Climate',           score: 32, color: '#EF9A9A' },
      { name: 'Supply Chain Transparency',  score: 28, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 30, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 35, color: '#EF9A9A' },
      { name: 'Packaging & Waste',          score: 40, color: '#FFCC80' },
    ],
    claims: [
      { status: 'negative', text: '"Join Life" collection — <strong>no independent certification</strong>; label discontinued in 2023 after EU scrutiny · Good On You' },
      { status: 'negative', text: 'Inditex carbon targets: <strong>progress not independently verified</strong> by SBTi to date · Source: CDP 2025' },
      { status: 'negative', text: 'Living wage: <strong>no demonstrated payment</strong> to Tier 1 garment workers · Good On You 2026' },
      { status: 'partial',  text: 'Some recycled fibre usage (exact % unverified) and limited organic cotton — <strong>No GOTS or bluesign® certification</strong>' },
    ],
    source: 'Good On You (2026) · CDP · Remake Fashion Accountability Report 2024',
  },
  adidas: {
    name: 'Adidas',
    type: 'Sportswear · MSCI A · Sustainalytics 22.4 Medium Risk',
    grade: 'C+', gradeClass: 'grade-c',
    initial: 'A', gradientStart: '#1565C0', gradientEnd: '#0D47A1',
    metrics: [
      { name: 'Carbon & Climate',           score: 60, color: '#FFF176' },
      { name: 'Supply Chain Transparency',  score: 55, color: '#FFF176' },
      { name: 'Labour Rights',              score: 52, color: '#FFF176' },
      { name: 'Material Sustainability',    score: 65, color: '#A5D6A7' },
      { name: 'Packaging & Waste',          score: 58, color: '#FFF176' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI ESG: <strong>A</strong> · Sustainalytics: <strong>22.4 (Medium Risk)</strong> · Source: MSCI 2025' },
      { status: 'partial', text: '"Stan Smith Mylo" (mycelium leather) prototype — <strong>not yet at commercial scale</strong>' },
      { status: 'partial', text: 'Better Cotton Initiative member, but <strong>Scope 3 targets not SBTi-validated</strong> · Source: Adidas 2024 Annual Report' },
      { status: 'negative', text: 'Labour rights — multiple supplier audit failures documented by Fair Labor Association 2024' },
    ],
    source: 'MSCI · Sustainalytics · Fair Labor Association · Adidas 2024 AR',
  },
  uniqlo: {
    name: 'Uniqlo (Fast Retailing)',
    type: 'Fast Fashion · Good On You: Not Good Enough · MSCI BBB',
    grade: 'D+', gradeClass: 'grade-d',
    initial: 'U', gradientStart: '#E53935', gradientEnd: '#B71C1C',
    metrics: [
      { name: 'Carbon & Climate',           score: 38, color: '#FFCC80' },
      { name: 'Supply Chain Transparency',  score: 30, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 32, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 40, color: '#FFCC80' },
      { name: 'Packaging & Waste',          score: 44, color: '#FFCC80' },
    ],
    claims: [
      { status: 'negative', text: 'Good On You: <strong>"Not Good Enough"</strong> — low scores across Planet, People, Animals · Good On You Jan 2026' },
      { status: 'negative', text: 'Xinjiang cotton risk — <strong>insufficient disclosure</strong> on sourcing; excluded from BCI membership 2020–2022' },
      { status: 'partial',  text: 'Re-UNIQLO clothing collection programme active, but <strong>scale vs. total production remains small</strong>' },
      { status: 'partial',  text: 'MSCI: <strong>BBB (Average)</strong> — moderate ESG management relative to sector peers' },
    ],
    source: 'Good On You (2026) · MSCI · Business & Human Rights Resource Centre',
  },
  shein: {
    name: 'SHEIN',
    type: 'Ultra-Fast Fashion · Good On You: We Avoid · No ESG rating',
    grade: 'F', gradeClass: 'grade-d',
    initial: 'S', gradientStart: '#B71C1C', gradientEnd: '#7F0000',
    metrics: [
      { name: 'Carbon & Climate',           score: 8,  color: '#EF9A9A' },
      { name: 'Supply Chain Transparency',  score: 5,  color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 6,  color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 10, color: '#EF9A9A' },
      { name: 'Packaging & Waste',          score: 12, color: '#EF9A9A' },
    ],
    claims: [
      { status: 'negative', text: 'Good On You: <strong>"We Avoid"</strong> — lowest possible rating; no credible sustainability programme · Good On You 2026' },
      { status: 'negative', text: 'Channel 4 / ITV investigative reports (2023–24): <strong>factories paying <$3/hour</strong>; hazardous chemicals in products (Incheon testing 2024)' },
      { status: 'negative', text: 'No SBTi registration, no CDP disclosure, no supply chain transparency — <strong>among the least transparent retailers globally</strong>' },
      { status: 'negative', text: 'EU regulators investigating under Digital Services Act for <strong>addictive dark patterns and underpaid influencer contracts</strong> (2025)' },
    ],
    source: 'Good On You (2026) · Channel 4 Dispatches · Incheon Customs Korea 2024',
  },
  levis: {
    name: "Levi's",
    type: "Denim · Good On You: It's a Start · MSCI BBB",
    grade: 'C', gradeClass: 'grade-c',
    initial: "L", gradientStart: '#1565C0', gradientEnd: '#0D47A1',
    metrics: [
      { name: 'Carbon & Climate',           score: 55, color: '#FFF176' },
      { name: 'Supply Chain Transparency',  score: 60, color: '#FFF176' },
      { name: 'Labour Rights',              score: 58, color: '#FFF176' },
      { name: 'Material Sustainability',    score: 62, color: '#FFF176' },
      { name: 'Packaging & Waste',          score: 50, color: '#FFF176' },
    ],
    claims: [
      { status: 'verified', text: "MSCI: <strong>BBB</strong> · Good On You: <strong>\"It's a Start\"</strong> — improving transparency but gaps remain" },
      { status: 'partial',  text: 'Water<Less® technology: <strong>saved 4.3 billion litres since 2011</strong> — verified, but jeans remain water-intensive overall' },
      { status: 'partial',  text: 'Cotton: Better Cotton member but <strong>no organic cotton certification for flagship lines</strong>' },
      { status: 'partial',  text: 'Living wage commitment stated but <strong>not independently verified</strong> across supply chain tiers · Source: Remake 2024' },
    ],
    source: "Good On You (2026) · MSCI · Levi's 2024 Annual Report · Remake",
  },
  samsung: {
    name: 'Samsung',
    type: 'Consumer Electronics · MSCI A · Sustainalytics 24.1 Medium Risk',
    grade: 'B-', gradeClass: 'grade-b',
    initial: 'S', gradientStart: '#1565C0', gradientEnd: '#003399',
    metrics: [
      { name: 'Carbon & Climate',           score: 68, color: '#90CAF9' },
      { name: 'Supply Chain Transparency',  score: 62, color: '#90CAF9' },
      { name: 'Labour Rights',              score: 60, color: '#90CAF9' },
      { name: 'Material Sustainability',    score: 70, color: '#64B5F6' },
      { name: 'Packaging & Waste',          score: 72, color: '#64B5F6' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI ESG: <strong>A</strong> · Sustainalytics: <strong>24.1 (Medium Risk)</strong> · CDP Climate Score: <strong>A-</strong> (2024)' },
      { status: 'verified', text: 'Galaxy for the Planet: 100% recycled ocean-bound plastics in select products · 2025 goal achieved for packaging' },
      { status: 'partial',  text: 'Renewable energy: <strong>42% of global operations</strong> in 2024 — below 2025 target of 50% · Source: Samsung 2024 Sustainability Report' },
      { status: 'partial',  text: 'Conflict minerals: partial disclosure; <strong>cobalt sourcing from DRC not fully traceable</strong> · RMI audit 2024' },
    ],
    source: 'MSCI · Sustainalytics · CDP · Samsung 2024 Sustainability Report',
  },
  ikea: {
    name: 'IKEA',
    type: 'Home Furnishings · MSCI BBB · SBTi Committed',
    grade: 'B', gradeClass: 'grade-b',
    initial: 'I', gradientStart: '#F9A825', gradientEnd: '#1565C0',
    metrics: [
      { name: 'Carbon & Climate',           score: 68, color: '#90CAF9' },
      { name: 'Supply Chain Transparency',  score: 65, color: '#90CAF9' },
      { name: 'Labour Rights',              score: 62, color: '#90CAF9' },
      { name: 'Material Sustainability',    score: 75, color: '#74C69D' },
      { name: 'Packaging & Waste',          score: 72, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI: <strong>BBB</strong> · 100% renewable electricity for IKEA Group since 2020 — <strong>Verified via annual reporting</strong>' },
      { status: 'verified', text: 'FSC-certified wood: <strong>98% of all wood</strong> (2024) — up from 90% in 2021 · Source: IKEA Sustainability Report 2024' },
      { status: 'partial',  text: 'Climate: targets validated by SBTi; but <strong>absolute Scope 3 emissions still rising</strong> with business growth' },
      { status: 'partial',  text: 'Living wage: IKEA suppliers audited, but <strong>gaps persist in Tier 2+ supply chain</strong> · Source: IWAY Standard 2024' },
    ],
    source: 'MSCI · IKEA Sustainability Report 2024 · FSC · SBTi',
  },
  tesla: {
    name: 'Tesla',
    type: 'Electric Vehicles · MSCI BBB · Sustainalytics 27.3 Medium Risk',
    grade: 'C+', gradeClass: 'grade-c',
    initial: 'T', gradientStart: '#E53935', gradientEnd: '#B71C1C',
    metrics: [
      { name: 'Carbon & Climate',           score: 72, color: '#A5D6A7' },
      { name: 'Supply Chain Transparency',  score: 40, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 35, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 62, color: '#FFF176' },
      { name: 'Packaging & Waste',          score: 55, color: '#FFF176' },
    ],
    claims: [
      { status: 'verified', text: 'Mission-driven EV maker — <strong>displaces ~20 Mt CO₂e annually</strong> vs ICE equivalents · Source: Tesla Impact Report 2024' },
      { status: 'partial',  text: 'MSCI: <strong>BBB</strong> · Sustainalytics: <strong>27.3 (Medium Risk)</strong> — flagged for governance and labour controversies' },
      { status: 'partial',  text: 'Cobalt: reducing via LFP battery chemistry, but <strong>DRC sourcing still present in NCA chemistry lines</strong>' },
      { status: 'negative', text: 'Labour: NLRB complaints, anti-union allegations, and racial discrimination lawsuit settlements in 2023–2025 · Source: Reuters' },
    ],
    source: 'MSCI · Sustainalytics · Tesla 2024 Impact Report · NLRB',
  },
  allbirds: {
    name: 'Allbirds',
    type: 'Sustainable Footwear · B Corp 89.4 · Carbon Labelled',
    grade: 'A-', gradeClass: 'grade-a',
    initial: 'A', gradientStart: '#6D4C41', gradientEnd: '#3E2723',
    metrics: [
      { name: 'Carbon & Climate',           score: 82, color: '#A5D6A7' },
      { name: 'Supply Chain Transparency',  score: 78, color: '#74C69D' },
      { name: 'Labour Rights',              score: 70, color: '#A5D6A7' },
      { name: 'Material Sustainability',    score: 85, color: '#52B788' },
      { name: 'Packaging & Waste',          score: 80, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'B Corp certified, score <strong>89.4</strong> · Carbon footprint labelled on <strong>every product</strong> — avg 7.6 kg CO₂e/pair · Source: B Lab' },
      { status: 'verified', text: 'Materials: ZQ merino wool, sugarcane-based SweetFoam® EVA, TENCEL™ Lyocell — <strong>all third-party certified</strong>' },
      { status: 'partial',  text: 'SBTi target: net-zero by 2030 (ambitious, not yet achieved) — <strong>2024 progress: 53% vs target run-rate</strong>' },
      { status: 'partial',  text: 'Revenue has declined 2023–24; sustainability investments at risk if company faces further financial pressure' },
    ],
    source: 'B Lab · Allbirds 2024 Impact Report · SBTi',
  },
  puma: {
    name: 'Puma',
    type: 'Sportswear · MSCI A · SBTi Committed',
    grade: 'C+', gradeClass: 'grade-c',
    initial: 'P', gradientStart: '#212121', gradientEnd: '#424242',
    metrics: [
      { name: 'Carbon & Climate',           score: 58, color: '#FFF176' },
      { name: 'Supply Chain Transparency',  score: 62, color: '#FFF176' },
      { name: 'Labour Rights',              score: 55, color: '#FFF176' },
      { name: 'Material Sustainability',    score: 60, color: '#FFF176' },
      { name: 'Packaging & Waste',          score: 65, color: '#A5D6A7' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI: <strong>A</strong> · SBTi committed · CDP Supplier Engagement Rating: <strong>A-</strong> (2024)' },
      { status: 'partial',  text: 'RE-SUEDE project (mycelium upper) — promising but <strong>limited commercial rollout</strong>' },
      { status: 'partial',  text: 'Better Cotton Initiative member; but <strong>recycled content target 30% by 2025 not yet fully met</strong>' },
      { status: 'negative', text: 'Labour: PUMA audits suppliers, but FLA assessments note <strong>wages below living wage in key sourcing countries</strong>' },
    ],
    source: 'MSCI · SBTi · CDP · PUMA 2024 Annual Report · FLA',
  },
  primark: {
    name: 'Primark',
    type: 'Fast Fashion · No ESG rating · Good On You: Not Good Enough',
    grade: 'D', gradeClass: 'grade-d',
    initial: 'P', gradientStart: '#1B5E20', gradientEnd: '#388E3C',
    metrics: [
      { name: 'Carbon & Climate',           score: 28, color: '#EF9A9A' },
      { name: 'Supply Chain Transparency',  score: 25, color: '#EF9A9A' },
      { name: 'Labour Rights',              score: 30, color: '#EF9A9A' },
      { name: 'Material Sustainability',    score: 32, color: '#EF9A9A' },
      { name: 'Packaging & Waste',          score: 35, color: '#EF9A9A' },
    ],
    claims: [
      { status: 'negative', text: 'Good On You: <strong>"Not Good Enough"</strong> across all pillars · Primark Cares: no independent verification of claims · 2026' },
      { status: 'partial',  text: '"Sustainable Cotton Programme" — Better Cotton Initiative member, but <strong>no organic or GOTS certification</strong>' },
      { status: 'negative', text: 'No carbon targets registered with SBTi; <strong>no CDP disclosure</strong> as of 2025 · Rank: near bottom in Fashion Transparency Index' },
      { status: 'negative', text: 'Labour: Rana Plaza building collapse link (Primark was a tenant) — <strong>compensation fund eventually contributed</strong> · Source: CCC' },
    ],
    source: 'Good On You (2026) · Fashion Transparency Index · Clean Clothes Campaign',
  },
  microsoft: {
    name: 'Microsoft',
    type: 'Technology · MSCI AAA · Sustainalytics 14.1 Low Risk',
    grade: 'A-', gradeClass: 'grade-a',
    initial: 'M', gradientStart: '#0078D4', gradientEnd: '#004B8D',
    metrics: [
      { name: 'Carbon & Climate',           score: 88, color: '#52B788' },
      { name: 'Supply Chain Transparency',  score: 75, color: '#74C69D' },
      { name: 'Labour Rights',              score: 72, color: '#74C69D' },
      { name: 'Material Sustainability',    score: 70, color: '#A5D6A7' },
      { name: 'Packaging & Waste',          score: 78, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI ESG: <strong>AAA (Leader)</strong> · Sustainalytics: <strong>14.1 (Low Risk)</strong> · CDP: <strong>A</strong> (Climate) · Source: MSCI 2025' },
      { status: 'verified', text: '100% renewable electricity for operations since 2014 · Committed to being <strong>carbon negative by 2030</strong> and removing all historical emissions by 2050' },
      { status: 'partial',  text: 'AI data centre expansion driving <strong>significant Scope 2 emissions growth</strong> — may impact 2030 carbon negative pledge · Source: Microsoft 2024 ESR' },
      { status: 'partial',  text: 'Supply chain: electronics hardware supply chain has <strong>documented cobalt and conflict mineral challenges</strong>' },
    ],
    source: 'MSCI · Sustainalytics · CDP · Microsoft 2024 Environmental Sustainability Report',
  },
  google: {
    name: 'Google (Alphabet)',
    type: 'Technology · MSCI AA · Sustainalytics 21.7 Medium Risk',
    grade: 'B+', gradeClass: 'grade-b',
    initial: 'G', gradientStart: '#4285F4', gradientEnd: '#0F4C81',
    metrics: [
      { name: 'Carbon & Climate',           score: 80, color: '#74C69D' },
      { name: 'Supply Chain Transparency',  score: 66, color: '#90CAF9' },
      { name: 'Labour Rights',              score: 65, color: '#90CAF9' },
      { name: 'Material Sustainability',    score: 68, color: '#90CAF9' },
      { name: 'Packaging & Waste',          score: 74, color: '#74C69D' },
    ],
    claims: [
      { status: 'verified', text: 'MSCI: <strong>AA</strong> · Sustainalytics: <strong>21.7 (Medium Risk)</strong> · Carbon neutral since 2007 — <strong>first major company to achieve this</strong>' },
      { status: 'verified', text: '24/7 carbon-free energy matching goal: <strong>64% achieved in 2023</strong> (target: 100% by 2030) · Source: Google Environmental Report 2024' },
      { status: 'negative', text: 'AI compute demand has caused <strong>GHG emissions to rise 48% since 2019</strong> · Source: Alphabet 2024 ESG Report' },
      { status: 'negative', text: 'Labour: ongoing contractor pay equity concerns; gig worker classification disputes globally · Source: Guardian / NYT investigations' },
    ],
    source: 'MSCI · Sustainalytics · Google 2024 Environmental Report · Alphabet ESG',
  },
  everlane: {
    name: 'Everlane',
    type: 'Sustainable Fashion · No B Corp · Radical Transparency claim',
    grade: 'C+', gradeClass: 'grade-c',
    initial: 'E', gradientStart: '#424242', gradientEnd: '#212121',
    metrics: [
      { name: 'Carbon & Climate',           score: 55, color: '#FFF176' },
      { name: 'Supply Chain Transparency',  score: 70, color: '#A5D6A7' },
      { name: 'Labour Rights',              score: 48, color: '#FFCC80' },
      { name: 'Material Sustainability',    score: 60, color: '#FFF176' },
      { name: 'Packaging & Waste',          score: 62, color: '#FFF176' },
    ],
    claims: [
      { status: 'partial',  text: '"Radical Transparency" — factory profiles published; but <strong>wage data not disclosed</strong> and audit methodology not third-party verified' },
      { status: 'negative', text: 'Labour issues: <strong>union drive suppressed in 2020</strong>; 100+ employees laid off after unionisation effort · Source: NLRB filing' },
      { status: 'partial',  text: 'ReNew recycled fleece programme is positive, but <strong>overall product range not certified organic or bluesign®</strong>' },
      { status: 'negative', text: 'No CDP disclosure, no SBTi registration, no B Corp certification despite sustainability positioning' },
    ],
    source: 'Good On You · NLRB · Remake Fashion Accountability Report 2024',
  },
};

function getBrandKey(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  if (q.includes('patagonia')) return 'patagonia';
  if (q.includes('h&m') || q.match(/\bh\s*&\s*m\b/) || q === 'hm') return 'hm';
  if (q.includes('apple') || q.includes('macbook') || q.includes('iphone') || q.includes('ipad')) return 'apple';
  if (q.includes('nike')) return 'nike';
  if (q.includes('eileen fisher') || q.includes('eileen')) return 'eileenfisher';
  if (q.includes('organic valley')) return 'organicvalley';
  if (q.includes('loreal') || q.includes("l'oreal") || q.includes("l'oréal") || q.includes('loréal')) return 'loreal';
  if (q.includes('fairphone')) return 'fairphone';
  if (q.includes('zara') || q.includes('inditex')) return 'zara';
  if (q.includes('adidas')) return 'adidas';
  if (q.includes('uniqlo') || q.includes('fast retailing')) return 'uniqlo';
  if (q.includes('shein')) return 'shein';
  if (q.includes("levi's") || q.includes('levis') || q.includes('levi strauss')) return 'levis';
  if (q.includes('samsung') || q.includes('galaxy')) return 'samsung';
  if (q.includes('ikea')) return 'ikea';
  if (q.includes('tesla')) return 'tesla';
  if (q.includes('allbirds')) return 'allbirds';
  if (q.includes('puma')) return 'puma';
  if (q.includes('primark')) return 'primark';
  if (q.includes('microsoft') || q.includes('windows') || q.includes('surface laptop') || q.includes('xbox')) return 'microsoft';
  if (q.includes('google') || q.includes('alphabet') || q.includes('pixel phone') || q.includes('nest')) return 'google';
  if (q.includes('everlane')) return 'everlane';
  return null;
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { brandData, getBrandKey };
} else {
  window.ecoBrandData = { brandData, getBrandKey };
}
