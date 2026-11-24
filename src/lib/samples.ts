/** Synthetic reports for trying Veil. Every person and number here is invented. */
export const SAMPLES = [
  {
    id: 'cbc',
    label: 'Blood count',
    hint: 'Low haemoglobin',
    text: `SUNRISE DIAGNOSTICS & PATHOLOGY LAB
MG Road, Kochi 682016 | Ph: +91 484 555 0142 | care@sunriselabs.example

Patient Name : Mrs. Anjali Menon           Patient ID : SDL/24/118203
Age / Sex    : 34 Y / Female               Sample No  : B-7720451
Ref. By      : Dr. Thomas Kurian           Collected  : 18/11/2026 08:14 AM
Address      : 14B Lake View Apartments, Panampilly Nagar, Kochi
Phone        : 98470 55512                 Reported   : 18/11/2026 02:40 PM

COMPLETE BLOOD COUNT (CBC)
Test                      Result     Unit          Reference Range
Haemoglobin               9.8        g/dL          12.0 - 15.5
RBC Count                 3.9        million/µL    3.8 - 4.8
PCV / Haematocrit         31.2       %             36 - 46
MCV                       74         fL            83 - 101
MCH                       24.1       pg            27 - 32
Total WBC Count           7400       /µL           4000 - 10000
Platelet Count            2.9        lakh/µL       1.5 - 4.1
Serum Ferritin            8          ng/mL         13 - 150
Vitamin B12               412        pg/mL         197 - 771

--- End of report ---`,
  },
  {
    id: 'metabolic',
    label: 'Sugar & cholesterol',
    hint: 'Pre-diabetic range',
    text: `CITYCARE HEALTH LABORATORIES
Reg. No: KA/BLR/2291 | support@citycare.example | 080 5550 1877

Name: Mr. Rahul Verma
UHID: CC-00982117        Visit No: V-20261120-44
Age: 47 Years   Gender: Male
Referred By: Dr. Priya Nair
Report Date: 20-Nov-2026

DIABETES & LIPID PROFILE
Fasting Blood Glucose      118     mg/dL     70 - 99
HbA1c                      6.2     %         4.0 - 5.6
Total Cholesterol          236     mg/dL     < 200
LDL Cholesterol            158     mg/dL     < 100
HDL Cholesterol            38      mg/dL     > 40
Triglycerides              214     mg/dL     < 150
Serum Creatinine           0.9     mg/dL     0.7 - 1.3
TSH                        2.4     µIU/mL    0.4 - 4.0`,
  },
  {
    id: 'thyroid',
    label: 'Thyroid & vitamin D',
    hint: 'Underactive thyroid',
    text: `NORTHWIND CLINICAL LABS
221 Orchard Street, Springfield | (555) 010-4477

Patient: Sarah Whitfield
MRN: NW-4471902      Accession No: A26-551872
Age: 29   Sex: F
Physician: Dr. Alan Brooks
Email: sarah.whitfield@mail.example
Collected: 11/19/2026

THYROID PANEL AND VITAMINS
TSH                    8.6      µIU/mL    0.4 - 4.0
Free T4                0.7      ng/dL     0.8 - 1.8
Free T3                2.9      pg/mL     2.3 - 4.2
Anti-TPO Antibodies    96       IU/mL     < 35
Vitamin D (25-OH)      14       ng/mL     30 - 100
Calcium                9.1      mg/dL     8.6 - 10.2`,
  },
] as const

export const LANGUAGES = ['English', 'हिन्दी (Hindi)', 'മലയാളം (Malayalam)', 'தமிழ் (Tamil)', 'Español', 'Français'] as const
