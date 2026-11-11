import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { join } from 'node:path';

import configuration from '../../config/configuration';
import { DatabaseModule } from '../database.module';
import { ApplicationModule } from '../../application/application.module';
import { PatientsModule } from '../../modules/patients/patients.module';
import { PatientsService } from '../../modules/patients/patients.service';
import { TreatmentsModule } from '../../modules/treatments/treatments.module';
import { ImplantsModule } from '../../modules/implants/implants.module';
import { ImplantRegistryService } from '../../modules/implants/implant-registry.service';
import { OrthoModule } from '../../modules/ortho/ortho.module';
import { OrthoRegistryService } from '../../modules/ortho/ortho-registry.service';
import { SurgeryModule } from '../../modules/surgery/surgery.module';
import { SurgeryService } from '../../modules/surgery/surgery.service';
import { LabsModule } from '../../modules/labs/labs.module';
import { LabCasesService } from '../../modules/labs/lab-cases.service';
import { Lab } from '../../modules/labs/lab.entity';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { Patient } from '../../modules/patients/patient.entity';
import {
  AbutmentType,
  CaseStatus,
  EducationLevel,
  FollowUpStatus,
  Gender,
  InventoryCategory,
  InventoryMovementKind,
  InventoryUnit,
  JalaliDate,
  LabJaw,
  LabTripKind,
  LabWorkType,
  SurgeryKind,
  SurgeryStatus,
  UserRole,
  searchKey,
} from '../../domain';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import { BCRYPT_COST, User } from '../../modules/users/user.entity';

/**
 * Demo data for trying the app out: a few hundred invented patients and the
 * work around them — implant and ortho files, surgery follow-ups, lab cases
 * and a stocked inventory with its movements.
 *
 *   DB_NAME=<a throwaway database> npm run seed:demo
 *
 * Everything goes through the same services the API uses, so search keys,
 * versions, the stock ledger and the audit trail come out exactly as if
 * staff had typed it in. Deterministic: the same seed gives the same data.
 *
 * Refuses a database that already holds any patient — this must never mix
 * invented people into a real register — and refuses production outright.
 */

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../../../../../.env'), '.env'],
    }),
    DatabaseModule,
    ApplicationModule,
    PatientsModule,
    TreatmentsModule,
    ImplantsModule,
    OrthoModule,
    SurgeryModule,
    LabsModule,
    InventoryModule,
  ],
})
class DemoSeedModule {}

// ── A seeded random source, so a re-run on a fresh database is identical ──

let state = 20261111;
function random(): number {
  // mulberry32
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(random() * list.length)];
const chance = (p: number) => random() < p;
const pickSome = <T>(list: readonly T[], min: number, max: number): T[] => {
  const pool = [...list];
  const out: T[] = [];
  for (let n = int(min, max); n > 0 && pool.length; n--) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return out;
};

const DAY = 86_400_000;
const today = new Date();
const daysFromNow = (days: number) => new Date(today.getTime() + days * DAY);
const jalali = (date: Date) => JalaliDate.fromDate(date)!.format();
const jalaliMonth = (date: Date) => jalali(date).slice(0, 7);

// ── Vocabulary ────────────────────────────────────────────────────────

const MALE = [
  'علی',
  'محمد',
  'حسین',
  'رضا',
  'مهدی',
  'امیر',
  'حمید',
  'سعید',
  'مجید',
  'کامران',
  'بهرام',
  'پویا',
  'آرش',
  'سینا',
  'نیما',
  'فرهاد',
  'مسعود',
  'داوود',
  'یوسف',
  'کیان',
  'پارسا',
  'امین',
  'بهزاد',
  'احسان',
  'میلاد',
  'مرتضی',
  'جواد',
  'هادی',
  'شهرام',
  'بابک',
];
const FEMALE = [
  'فاطمه',
  'زهرا',
  'مریم',
  'سارا',
  'نرگس',
  'لیلا',
  'الهام',
  'شیرین',
  'مهسا',
  'نازنین',
  'پریسا',
  'سمیرا',
  'هانیه',
  'کیمیا',
  'آیدا',
  'نسرین',
  'رویا',
  'مینا',
  'ترانه',
  'یاسمن',
  'الناز',
  'فرزانه',
  'ساناز',
  'نگار',
  'هستی',
  'معصومه',
  'طاهره',
  'شبنم',
  'مهناز',
  'ژیلا',
];
const LAST = [
  'احمدی',
  'محمدی',
  'حسینی',
  'رضایی',
  'کریمی',
  'موسوی',
  'جعفری',
  'صادقی',
  'رحیمی',
  'کاظمی',
  'قاسمی',
  'نوری',
  'طاهری',
  'شریفی',
  'عباسی',
  'اکبری',
  'مرادی',
  'یوسفی',
  'حیدری',
  'زارعی',
  'سلیمانی',
  'باقری',
  'نجفی',
  'فرهادی',
  'ملکی',
  'امینی',
  'توکلی',
  'صالحی',
  'بهرامی',
  'کامرانی',
  'نیک‌نام',
  'پاکزاد',
  'شکوهی',
  'افشار',
  'رستمی',
  'تهرانی',
  'شیرازی',
  'اصفهانی',
  'قنبری',
  'دلاوری',
];
const OCCUPATIONS = [
  'کارمند',
  'معلم',
  'مهندس',
  'دانشجو',
  'آزاد',
  'خانه‌دار',
  'پزشک',
  'بازنشسته',
  'راننده',
  'حسابدار',
  'وکیل',
  'پرستار',
  'فروشنده',
  'برنامه‌نویس',
  'معمار',
];
const STREETS = [
  'ولیعصر',
  'شریعتی',
  'انقلاب',
  'آزادی',
  'ستارخان',
  'پاسداران',
  'نیاوران',
  'جردن',
  'مطهری',
  'فاطمی',
  'سهروردی',
  'دولت',
  'میرداماد',
  'جمهوری',
  'کارگر',
];
const REFERRALS = [
  'اینستاگرام',
  'معرفی دوستان',
  'جست‌وجوی گوگل',
  'تابلوی مطب',
  'بیمار قبلی',
  'معرفی پزشک',
];
const HISTORY = [
  'دیابت نوع 2',
  'فشار خون بالا',
  'حساسیت به پنی‌سیلین',
  'مصرف وارفارین',
  'آسم',
  'بیماری قلبی',
  'کم‌کاری تیرویید',
  'بارداری',
];
const NOTES = [
  'ترجیح نوبت عصر',
  'بیمار مضطرب؛ با حوصله توضیح داده شود',
  'پیگیری تلفنی ترجیح دارد',
  'هزینه در دو قسط',
  'همراه با فرزند مراجعه می‌کند',
];
const TREATMENT_CODES = [
  'veneer',
  'composite',
  'implant',
  'extraction',
  'root_canal',
  'orthodontics',
  'filling',
  'crown',
  'sinus_lift',
  'scaling',
  'bleaching',
  'gum_lift',
  'polishing',
];
const IMPLANT_BRANDS = [
  'Neobiotech',
  'Dentium',
  'Osstem',
  'Straumann',
  'Megagen',
  'Dio',
];
const LABS = [
  'لابراتوار مهر',
  'دندان‌ساز پارس',
  'لابراتوار نگین',
  'آریا دنت',
  'لابراتوار سپید',
];
const SUPPLIERS = ['پخش آریا طب', 'دنتال کالا', 'تجهیز گستر نوین', 'سپهر دارو'];
const UPPER = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27];
const LOWER = [31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47];

/** A ten-digit code that passes the national-id checksum. */
function nationalId(): string {
  for (;;) {
    const digits = Array.from({ length: 9 }, () => int(0, 9));
    if (new Set(digits).size === 1) continue;
    const sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
    const r = sum % 11;
    return digits.join('') + String(r < 2 ? r : 11 - r);
  }
}

const mobile = () =>
  '09' +
  pick(['12', '35', '19', '36', '10', '21', '01', '02', '03', '30']) +
  String(int(0, 9_999_999)).padStart(7, '0');

// ── Recording what went wrong, without stopping ──────────────────────

const failures = new Map<string, number>();
async function attempt<T>(
  what: string,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    const reason = `${what}: ${error instanceof Error ? error.message : String(error)}`;
    failures.set(reason, (failures.get(reason) ?? 0) + 1);
    return null;
  }
}

interface SeededPatient {
  id: string;
  fileNo: string;
  name: string;
  mobile: string;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }
  const app = await NestFactory.createApplicationContext(DemoSeedModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(DataSource);

    // A dentist to sign in as, without the first-login password change. Kept
    // apart from the data below: re-running only (re)creates the account.
    const users = db.getRepository(User);
    const demoUser = process.env.SEED_DEMO_USERNAME ?? 'demo';
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (!demoPassword)
      throw new Error('SEED_DEMO_PASSWORD is not set (see .env.example).');
    if (!(await users.exists({ where: { username: demoUser } }))) {
      await users.save(
        users.create({
          username: demoUser,
          passwordHash: await bcrypt.hash(demoPassword, BCRYPT_COST),
          fullName: 'دکتر نمونه',
          role: UserRole.Dentist,
          isActive: true,
          mustChangePassword: false,
        }),
      );
      console.log(`✓  demo user "${demoUser}" (password: SEED_DEMO_PASSWORD)`);
    }

    const existing = await db
      .getRepository(Patient)
      .count({ withDeleted: true });
    if (existing > 0) {
      console.log(
        `•  Demo data skipped: "${db.options.database as string}" already holds ${existing} patient(s). ` +
          'It goes into an empty database only.',
      );
      return;
    }

    const patientsService = app.get(PatientsService);
    const implants = app.get(ImplantRegistryService);
    const ortho = app.get(OrthoRegistryService);
    const surgery = app.get(SurgeryService);
    const labCases = app.get(LabCasesService, { strict: false });
    const inventory = app.get(InventoryService, { strict: false });

    // ── Patients ──────────────────────────────────────────────────
    const patients: SeededPatient[] = [];
    for (let i = 0; i < 320; i++) {
      const female = chance(0.55);
      const firstName = pick(female ? FEMALE : MALE);
      const lastName = pick(LAST);
      const born = daysFromNow(-int(6 * 365, 80 * 365));
      const firstVisit = daysFromNow(-int(10, 4 * 365));
      const lastVisit = new Date(
        firstVisit.getTime() +
          random() * (today.getTime() - firstVisit.getTime()),
      );
      const phone = mobile();
      const treatments = pickSome(TREATMENT_CODES, 0, 4).map((code) => ({
        code,
        performedAt: chance(0.7)
          ? jalali(
              new Date(
                firstVisit.getTime() +
                  random() * (today.getTime() - firstVisit.getTime()),
              ),
            )
          : null,
        notes: null,
      }));
      const created = await attempt('patient', () =>
        patientsService.create(
          {
            fileNo: String(1001 + i),
            firstName,
            lastName,
            fatherName: chance(0.8) ? pick(MALE) : null,
            nationalId: chance(0.85) ? nationalId() : null,
            gender: female ? Gender.Female : Gender.Male,
            mobile: chance(0.95) ? phone : null,
            homePhone: chance(0.3)
              ? '021' + String(int(20_000_000, 89_999_999))
              : null,
            birthDate: chance(0.9) ? jalali(born) : null,
            occupation: chance(0.7) ? pick(OCCUPATIONS) : null,
            education: pick(Object.values(EducationLevel)),
            referralSourceName: chance(0.75) ? pick(REFERRALS) : null,
            medicalHistory: chance(0.25)
              ? pickSome(HISTORY, 1, 2).join('، ')
              : null,
            homeAddress: chance(0.7)
              ? `تهران، خیابان ${pick(STREETS)}، کوچه ${int(1, 40)}، پلاک ${int(1, 120)}`
              : null,
            workAddress: null,
            firstVisitAt: jalali(firstVisit),
            lastVisitAt: jalali(lastVisit),
            notes: chance(0.15) ? pick(NOTES) : null,
            treatments,
          },
          null,
          'admin',
        ),
      );
      if (created) {
        patients.push({
          id: created.id,
          fileNo: String(1001 + i),
          name: `${firstName} ${lastName}`,
          mobile: phone,
        });
      }
    }
    console.log(`✓  patients: ${patients.length}`);

    // ── Implant and ortho files ───────────────────────────────────
    const implantPatients = pickSome(patients, 95, 95);
    const implantCases: Array<{ id: string; patient: SeededPatient }> = [];
    for (const patient of implantPatients) {
      const file = (await attempt('implant file', () =>
        implants.create(
          {
            patientId: patient.id,
            recordedName: patient.name,
            mobile: patient.mobile,
            status: pick([
              CaseStatus.Active,
              CaseStatus.Active,
              CaseStatus.Completed,
              CaseStatus.OnHold,
            ]),
          },
          null,
        ),
      )) as { id: string } | null;
      if (file) implantCases.push({ id: file.id, patient });
    }
    console.log(`✓  implant files: ${implantCases.length}`);

    let orthoCount = 0;
    for (const patient of pickSome(patients, 45, 45)) {
      const file = await attempt('ortho file', () =>
        ortho.create(
          {
            patientId: patient.id,
            recordedName: patient.name,
            mobile: patient.mobile,
            status: pick([
              CaseStatus.Active,
              CaseStatus.Active,
              CaseStatus.Completed,
            ]),
          },
          null,
        ),
      );
      if (file) orthoCount++;
    }
    console.log(`✓  ortho files: ${orthoCount}`);

    // ── Surgery and follow-ups ────────────────────────────────────
    let surgeries = 0;
    for (const { id: implantCaseId, patient } of implantCases) {
      for (let n = int(1, 2); n > 0; n--) {
        const offset = chance(0.12) ? int(1, 30) : -int(5, 420);
        const done = offset < 0;
        const months = pick([3, 4, 6]);
        const due = offset + months * 30;
        const followUpStatus = !done
          ? FollowUpStatus.Open
          : chance(0.15)
            ? FollowUpStatus.Declined
            : due > -20 && due < 40 && chance(0.45)
              ? FollowUpStatus.Booked
              : FollowUpStatus.Open;
        const row = await attempt('surgery', () =>
          surgery.create(
            {
              kind: SurgeryKind.Implant,
              implantCaseId,
              patientId: patient.id,
              recordedName: patient.name,
              surgeryDate: jalali(daysFromNow(offset)),
              teethFdi: pickSome(chance(0.5) ? UPPER : LOWER, 1, 3),
              implantBrand: pick(IMPLANT_BRANDS),
              abutmentType: pick([
                AbutmentType.Cover,
                AbutmentType.Healing,
                AbutmentType.Both,
              ]),
              followUpMonths: months,
              followUpStatus,
              followUpAppointmentAt:
                followUpStatus === FollowUpStatus.Booked
                  ? jalali(daysFromNow(int(1, 25)))
                  : null,
              status: done
                ? chance(0.05)
                  ? SurgeryStatus.Cancelled
                  : SurgeryStatus.Completed
                : SurgeryStatus.Scheduled,
              notes: chance(0.1) ? pick(NOTES) : null,
            },
            null,
            'admin',
          ),
        );
        if (row) surgeries++;
      }
    }
    const otherKinds = [
      SurgeryKind.Extraction,
      SurgeryKind.BoneGraft,
      SurgeryKind.SinusLift,
    ];
    for (const patient of pickSome(patients, 45, 45)) {
      const offset = chance(0.15) ? int(1, 20) : -int(3, 300);
      const row = await attempt('surgery', () =>
        surgery.create(
          {
            kind: pick(otherKinds),
            patientId: patient.id,
            recordedName: patient.name,
            surgeryDate: jalali(daysFromNow(offset)),
            teethFdi: pickSome([...UPPER, ...LOWER], 1, 2),
            followUpMonths: pick([1, 3]),
            followUpStatus: FollowUpStatus.Open,
            status:
              offset < 0 ? SurgeryStatus.Completed : SurgeryStatus.Scheduled,
          },
          null,
          'admin',
        ),
      );
      if (row) surgeries++;
    }
    console.log(`✓  surgeries: ${surgeries}`);

    // ── Labs and lab cases ────────────────────────────────────────
    const labRepo = db.getRepository(Lab);
    const labs: Lab[] = [];
    for (const [i, name] of LABS.entries()) {
      labs.push(
        await labRepo.save(
          labRepo.create({
            name,
            normalizedName: searchKey(name),
            sortOrder: i + 1,
            isActive: true,
          }),
        ),
      );
    }
    let labCaseCount = 0;
    for (const patient of pickSome(patients, 75, 75)) {
      const implantCrown = chance(0.35);
      const workType = implantCrown
        ? LabWorkType.ImplantCrown
        : pick([
            LabWorkType.Crown,
            LabWorkType.Crown,
            LabWorkType.Laminate,
            LabWorkType.Post,
            LabWorkType.NightGuard,
          ]);
      const teeth =
        workType === LabWorkType.NightGuard
          ? []
          : pickSome(
              [...UPPER, ...LOWER],
              1,
              workType === LabWorkType.Laminate ? 6 : 2,
            );
      const row = await attempt('lab case', () =>
        labCases.create(
          {
            patientId: patient.id,
            recordedName: patient.name,
            labId: pick(labs).id,
            toothWork: teeth.map((tooth) => ({ tooth, workType })),
            workTypes: teeth.length ? undefined : [workType],
            jaw:
              workType === LabWorkType.NightGuard
                ? pick([LabJaw.Upper, LabJaw.Lower])
                : null,
            implantBrand: implantCrown ? pick(IMPLANT_BRANDS) : null,
            impressionCount: implantCrown ? int(1, 2) : null,
            analogCount: implantCrown ? int(1, 2) : null,
            notes: chance(0.15) ? 'رنگ A2، تطبیق با دندان مجاور' : null,
            tripKind: pick([
              LabTripKind.Impression,
              LabTripKind.Scan,
              LabTripKind.Frame,
              LabTripKind.Resin,
            ]),
            sentAt: jalali(daysFromNow(-int(0, 40))),
            waitDays: int(5, 14),
            tripNote: null,
          },
          null,
        ),
      );
      if (row) labCaseCount++;
    }
    console.log(`✓  labs: ${labs.length}, lab cases: ${labCaseCount}`);

    // ── Inventory ─────────────────────────────────────────────────
    type Stock = {
      category: InventoryCategory;
      name: string;
      brand?: string;
      spec?: string;
      unit: InventoryUnit;
      min: number;
    };
    const STOCK: Stock[] = [
      ...['3.5x10', '4.0x10', '4.0x11.5', '4.5x10', '5.0x8.5'].map((spec) => ({
        category: InventoryCategory.Implant,
        name: 'فیکسچر ایمپلنت',
        brand: 'Dentium',
        spec,
        unit: InventoryUnit.Piece,
        min: 3,
      })),
      ...['4.0x10', '4.5x11.5', '5.0x10'].map((spec) => ({
        category: InventoryCategory.Implant,
        name: 'فیکسچر ایمپلنت',
        brand: 'Osstem',
        spec,
        unit: InventoryUnit.Piece,
        min: 2,
      })),
      {
        category: InventoryCategory.Regenerative,
        name: 'پودر استخوان',
        brand: 'Bio-Oss',
        spec: '0.5g',
        unit: InventoryUnit.Bottle,
        min: 2,
      },
      {
        category: InventoryCategory.Regenerative,
        name: 'ممبران کلاژنی',
        brand: 'Bio-Gide',
        spec: '25x25',
        unit: InventoryUnit.Piece,
        min: 2,
      },
      {
        category: InventoryCategory.Anesthesia,
        name: 'لیدوکایین 2%',
        unit: InventoryUnit.Cartridge,
        min: 50,
      },
      {
        category: InventoryCategory.Anesthesia,
        name: 'آرتیکایین 4%',
        unit: InventoryUnit.Cartridge,
        min: 40,
      },
      {
        category: InventoryCategory.Anesthesia,
        name: 'سوزن کارپول کوتاه',
        unit: InventoryUnit.Box,
        min: 2,
      },
      {
        category: InventoryCategory.Restorative,
        name: 'کامپوزیت',
        brand: '3M',
        spec: 'A2',
        unit: InventoryUnit.Syringe,
        min: 4,
      },
      {
        category: InventoryCategory.Restorative,
        name: 'کامپوزیت',
        brand: '3M',
        spec: 'A3',
        unit: InventoryUnit.Syringe,
        min: 4,
      },
      {
        category: InventoryCategory.Restorative,
        name: 'باندینگ',
        brand: 'Ivoclar',
        unit: InventoryUnit.Bottle,
        min: 2,
      },
      {
        category: InventoryCategory.Restorative,
        name: 'گلاس آینومر',
        unit: InventoryUnit.Kit,
        min: 1,
      },
      {
        category: InventoryCategory.Endo,
        name: 'فایل روتاری',
        brand: 'Dentsply',
        spec: 'F2',
        unit: InventoryUnit.Pack,
        min: 3,
      },
      {
        category: InventoryCategory.Endo,
        name: 'گوتاپرکا',
        spec: '#25',
        unit: InventoryUnit.Box,
        min: 2,
      },
      {
        category: InventoryCategory.Endo,
        name: 'هیپوکلریت سدیم',
        unit: InventoryUnit.Bottle,
        min: 2,
      },
      {
        category: InventoryCategory.Impression,
        name: 'آلژینات',
        unit: InventoryUnit.Pack,
        min: 3,
      },
      {
        category: InventoryCategory.Impression,
        name: 'پوتی',
        brand: 'Zhermack',
        unit: InventoryUnit.Kit,
        min: 1,
      },
      {
        category: InventoryCategory.Surgery,
        name: 'نخ بخیه',
        spec: '4-0',
        unit: InventoryUnit.Box,
        min: 2,
      },
      {
        category: InventoryCategory.Surgery,
        name: 'تیغ بیستوری',
        spec: '#15',
        unit: InventoryUnit.Box,
        min: 1,
      },
      {
        category: InventoryCategory.Orthodontic,
        name: 'براکت',
        brand: 'Ormco',
        unit: InventoryUnit.Kit,
        min: 2,
      },
      {
        category: InventoryCategory.Orthodontic,
        name: 'سیم نایتینول',
        spec: '0.014',
        unit: InventoryUnit.Pack,
        min: 3,
      },
      {
        category: InventoryCategory.Consumable,
        name: 'دستکش لاتکس',
        spec: 'M',
        unit: InventoryUnit.Box,
        min: 10,
      },
      {
        category: InventoryCategory.Consumable,
        name: 'دستکش لاتکس',
        spec: 'S',
        unit: InventoryUnit.Box,
        min: 6,
      },
      {
        category: InventoryCategory.Consumable,
        name: 'ماسک سه‌لایه',
        unit: InventoryUnit.Box,
        min: 5,
      },
      {
        category: InventoryCategory.Consumable,
        name: 'رول پنبه',
        unit: InventoryUnit.Pack,
        min: 4,
      },
      {
        category: InventoryCategory.Consumable,
        name: 'ساکشن یک‌بار مصرف',
        unit: InventoryUnit.Pack,
        min: 4,
      },
      {
        category: InventoryCategory.Hygiene,
        name: 'محلول ضدعفونی سطوح',
        unit: InventoryUnit.Bottle,
        min: 3,
      },
      {
        category: InventoryCategory.Hygiene,
        name: 'پاکت استریل',
        unit: InventoryUnit.Box,
        min: 3,
      },
      {
        category: InventoryCategory.Prosthetic,
        name: 'اباتمنت',
        brand: 'Dentium',
        spec: '4.5',
        unit: InventoryUnit.Piece,
        min: 3,
      },
      {
        category: InventoryCategory.Prosthetic,
        name: 'هیلینگ',
        brand: 'Dentium',
        spec: '4.5x4',
        unit: InventoryUnit.Piece,
        min: 4,
      },
    ];
    const traceable = new Set([
      InventoryCategory.Implant,
      InventoryCategory.Regenerative,
    ]);
    const stocked: Array<{ id: string; stock: Stock }> = [];
    for (const stock of STOCK) {
      // A mix the stock filters can find: plenty, running low, run out, expiring soon.
      const level = random();
      const quantity =
        level < 0.12
          ? 0
          : level < 0.32
            ? int(1, Math.max(1, stock.min - 1))
            : int(stock.min + 2, stock.min * 4 + 6);
      const expiry =
        traceable.has(stock.category) || chance(0.5)
          ? jalaliMonth(daysFromNow(chance(0.18) ? int(10, 55) : int(120, 900)))
          : null;
      const item = (await attempt('inventory item', () =>
        inventory.create(
          {
            category: stock.category,
            name: stock.name,
            brand: stock.brand ?? null,
            spec: stock.spec ?? null,
            unit: stock.unit,
            minQuantity: stock.min,
            expiry: quantity ? expiry : null,
            notes: null,
            soldToPatients: stock.category === InventoryCategory.Implant,
            salePrice:
              stock.category === InventoryCategory.Implant
                ? int(18, 45) * 1_000_000
                : null,
            quantity,
            lotNumber:
              quantity && traceable.has(stock.category)
                ? `L${int(10000, 99999)}`
                : null,
          },
          null,
        ),
      )) as { id: string } | null;
      if (item) stocked.push({ id: item.id, stock });
    }

    let movements = 0;
    for (const { id, stock } of stocked) {
      if (traceable.has(stock.category)) continue;
      // A delivery or two from a supplier, then some use.
      for (let n = int(0, 2); n > 0; n--) {
        const moved = await attempt('inventory receive', () =>
          inventory.move(
            id,
            {
              kind: InventoryMovementKind.Receive,
              quantity: int(2, stock.min * 2 + 2),
              supplier: pick(SUPPLIERS),
              unitPrice: int(2, 40) * 100_000,
              expiry: chance(0.4)
                ? jalaliMonth(daysFromNow(int(200, 800)))
                : null,
              note: null,
            },
            null,
          ),
        );
        if (moved) movements++;
      }
      for (let n = int(0, 3); n > 0; n--) {
        const moved = await attempt('inventory use', () =>
          inventory.move(
            id,
            {
              kind: InventoryMovementKind.Use,
              quantity: 1,
              patientFileNo: chance(0.5) ? pick(patients).fileNo : null,
              note: null,
            },
            null,
          ),
        );
        if (moved) movements++;
      }
    }
    console.log(
      `✓  inventory items: ${stocked.length}, movements: ${movements}`,
    );
  } finally {
    await app.close();
  }

  if (failures.size) {
    console.log('\n!  Some records were refused by the services:');
    for (const [reason, count] of failures)
      console.log(`   ${count} × ${reason}`);
  }
}

main().catch((err: unknown) => {
  console.error(
    '✗  Demo seed failed:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
