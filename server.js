import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REGULATIONS_SYSTEM_PROMPT = `You are a UK Building Regulations compliance expert. Given building parameters and a list of regulation domains, you evaluate compliance against the relevant Approved Documents and return a structured JSON report.

UK APPROVED DOCUMENTS REFERENCE:

**Approved Document A (Structure)**
- A1 Loading: Structure must resist dead, imposed, wind and snow loads without excessive deflection
- A2 Ground Movement: Foundations must account for ground movement, swelling/shrinkage, tree roots
- A3 Disproportionate Collapse: Class 2B and above require key element design; Class 3 requires systematic risk assessment
- Building classes: Class 1 (1-2 storey houses), Class 2A (3 storey houses/4 storey flats), Class 2B (>4 storeys to 15m), Class 3 (>15m or complex)

**Approved Document B (Fire Safety) Vol 1 (Dwellings) & Vol 2 (Buildings other than dwellings)**
- B1 Means of Warning and Escape: Smoke alarms, escape routes, travel distances (18m single direction, 35m in multiple directions for offices)
- B2 Internal Fire Spread (Linings): Class 0/1 materials in escape routes; restrictions on thermoplastics
- B3 Internal Fire Spread (Structure): Fire resistance periods: 30min (1-2 storey), 60min (3-4 storey), 90min+ (5+ storey)
- B4 External Fire Spread: Boundary distances; combustible cladding restrictions (>18m buildings banned from ACM/HPL)
- B5 Access for Fire Services: Vehicle access, dry/wet risers, firefighting lifts required at >18m
- High-rise (>18m or >6 storeys): Building Safety Act 2022 principal designer/contractor duty holders required
- Sprinkler systems: Required for blocks of flats >11m, care homes, school buildings

**Approved Document C (Site Preparation)**
- Resistance to weather and ground moisture
- Sub-soil drainage where necessary
- Radon protection in affected areas

**Approved Document D (Cavity Insulation)**
- Urea formaldehyde foam restrictions

**Approved Document E (Resistance to Sound)**
- E1 Protection against sound from other parts of building: Airborne Rw+Ctr ≥45dB walls/floors, Impact Ln,w+CI ≤62dB floors
- E2 Protection against sound from adjoining buildings
- E3 Reverberation in common areas of buildings with flats
- E4 Acoustic conditions in schools: RT ≤0.8s classrooms
- Pre-completion testing required for separating elements in new dwellings

**Approved Document F (Ventilation) 2021**
- F1 Means of Ventilation: Whole building ventilation rates; extract rates for wet rooms
  - Dwellings: Whole house 0.3 l/s/m² or 13 l/s per person; kitchen 30 l/s extract, bathroom 15 l/s
  - Non-dwellings: Minimum 10 l/s per person plus building-specific pollutant control
- F2 Information: O&M manual, commissioning record required
- Mechanical ventilation systems require commissioning to design flow rates

**Approved Document G (Sanitation)**
- Cold water supply, hot water safety, bathrooms

**Approved Document H (Drainage)**
- Foul drainage, wastewater treatment, cesspools

**Approved Document J (Combustion Appliances)**
- Hearths, flues, air supply, warning systems

**Approved Document K (Protection from Falling)**
- K1 Stairs/ramps: Maximum riser 220mm, minimum going 220mm for private; 150-170mm riser for public
- K2 Protection from falling: Guarding required where floor >600mm above adjacent; min 900mm (1100mm for commercial)
- K3 Vehicle barriers

**Approved Document L (Conservation of Fuel and Power) 2021**
- L1A New dwellings: Primary Energy Rate (PER) target; Fabric Energy Efficiency Standard (FEES); CO₂ target
- L1B Existing dwellings: U-value standards for replacements; minimum efficiency for services
- L2A New non-dwellings: TER/BER calculation; BRUKL/iSBEM submission required
- L2B Existing non-dwellings: Consequential improvements; efficiency standards
- EPC required before completion; min band B for new builds

**Approved Document M (Access)**
- M4(1) Visitable: All new dwellings; step-free access, minimum door widths 775mm
- M4(2) Accessible & Adaptable: 67% of homes in major developments; level thresholds, wider doors, turning circles
- M4(3) Wheelchair User Dwellings: To BCO requirement
- Non-domestic: Part M compliance for circulation, facilities, WCs

**Approved Document N (Glazing)**
- Safe breakage; manifestation; safe opening/cleaning

**Approved Document O (Overheating) 2021**
- O1 Mitigating overheating: Dynamic thermal modelling (TM59) required for flats in moderate/high risk areas
- Simplified method for houses: solar gain limits by orientation and glazing area
- High-rise residential in urban heat islands: automatic override not sufficient without external shading

**Approved Document P (Electrical Safety)**
- Notifiable electrical installation work; Part P registered electrician or BCO inspection

**Approved Document Q (Security)**
- Door/window security standards for new dwellings; certified multi-point locks

**Approved Document R (Physical Infrastructure)**
- Gigabit-ready infrastructure in new developments

**Approved Document S (EV Charging)**
- New residential: 1 active EV charger per dwelling with parking
- Major refurbishment: passive (cable route) provision

**SAP 2012 / SAP 10.2**
- Standard Assessment Procedure for energy rating
- Inputs: construction, heating, hot water, lighting, renewables
- Outputs: SAP rating, EPC band, CO₂ emissions, primary energy
- Submitted to SBEM/NCalc for non-dwellings

COMPLIANCE ASSESSMENT RULES:
- Report 'pass' for items that clearly meet requirements based on building parameters
- Report 'warning' for items that need attention or borderline cases
- Report 'requires_review' for items needing specialist assessment or calculation
- Report 'fail' for items that clearly violate requirements
- Status 'non_compliant' only when hard failures are present
- Status 'requires_review' when specialist input is needed
- Status 'compliant' when all items pass

You MUST return ONLY valid JSON matching the ComplianceReport schema. No markdown, no explanation outside the JSON.`;

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    overallStatus: { type: 'string', enum: ['compliant', 'non_compliant', 'requires_review'] },
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['compliant', 'non_compliant', 'requires_review', 'not_applicable'] },
          summary: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                clause: { type: 'string' },
                document: { type: 'string' },
                title: { type: 'string' },
                requirement: { type: 'string' },
                status: { type: 'string', enum: ['pass', 'fail', 'warning', 'info'] },
                notes: { type: 'string' },
              },
              required: ['clause', 'document', 'title', 'requirement', 'status'],
            },
          },
        },
        required: ['domain', 'label', 'status', 'summary', 'items'],
      },
    },
    recommendations: { type: 'array', items: { type: 'string' } },
    regulationDocuments: { type: 'array', items: { type: 'string' } },
  },
  required: ['overallStatus', 'domains', 'recommendations', 'regulationDocuments'],
};

const DOMAIN_TO_DOCUMENT = {
  fire_safety:  'Approved Document B (Fire Safety)',
  ventilation:  'Approved Document F (Ventilation)',
  structural:   'Approved Document A (Structure)',
  energy:       'Approved Document L (Conservation of Fuel and Power)',
  overheating:  'Approved Document O (Overheating)',
  acoustics:    'Approved Document E (Resistance to Sound)',
  sap:          'SAP 10.2 (Standard Assessment Procedure)',
  drainage:     'Approved Document H (Drainage and Waste Disposal)',
  access:       'Approved Document M (Access to and Use of Buildings)',
  electrical:   'Approved Document P (Electrical Safety)',
  security:     'Approved Document Q (Security)',
  site_prep:    'Approved Document C (Site Preparation and Resistance to Contaminants)',
  sanitation:   'Approved Document G (Sanitation, Hot Water Safety and Water Efficiency)',
  falling:      'Approved Document K (Protection from Falling, Collision and Impact)',
  broadband:    'Approved Document R (Physical Infrastructure for High-Speed Electronic Communications)',
  ev_charging:  'Approved Document S (Infrastructure for the Charging of Electric Vehicles)',
};

function buildUserPrompt(query) {
  const bp = query.buildingParameters;
  const domainList = query.domains
    .map(d => `  - ${d} → ${DOMAIN_TO_DOCUMENT[d] || d}`)
    .join('\n');
  const lines = [
    `Building Parameters:`,
    `- Use: ${bp.buildingUse}`,
    `- Construction: ${bp.constructionType}`,
    `- Storeys: ${bp.numberOfStoreys}`,
    `- Floor area: ${bp.floorAreaM2}m²`,
    `- Occupancy estimate: ${bp.occupancyEstimate}`,
    `- Has basement: ${bp.hasBasement}`,
    `- Has atrium: ${bp.hasAtrium}`,
    ``,
    `Domains to assess (key → Approved Document):`,
    domainList,
  ];
  if (query.additionalContext) {
    lines.push(``, `Additional context: ${query.additionalContext}`);
  }
  lines.push(``, `Return a JSON object matching the ComplianceReport schema with detailed clause-level assessment for each domain. Use the domain key (e.g. "fire_safety") as the domain field value.`);
  return lines.join('\n');
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.1.0' });
});

app.get('/domains', (_req, res) => {
  res.json({
    domains: Object.entries(DOMAIN_TO_DOCUMENT).map(([key, document]) => ({ key, document })),
  });
});

app.post('/check', async (req, res) => {
  const query = req.body;
  if (!query?.buildingParameters || !Array.isArray(query?.domains)) {
    return res.status(400).json({ error: 'Missing buildingParameters or domains' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: REGULATIONS_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(query),
        },
      ],
    });

    const raw = message.content[0].text.trim();
    let reportCore;
    try {
      reportCore = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      reportCore = JSON.parse(jsonMatch[0]);
    }

    const report = {
      id: `report-${randomUUID()}`,
      queryId: query.id || `query-${randomUUID()}`,
      projectId: query.projectId,
      generatedAt: new Date().toISOString(),
      ...reportCore,
    };

    res.json(report);
  } catch (err) {
    console.error('Compliance check error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`BuildwellAI Compliance API running on port ${PORT}`);
});
