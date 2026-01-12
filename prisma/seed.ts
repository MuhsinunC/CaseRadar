import { PrismaClient, Plan, Role, ComplaintStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { clerkOrgId: 'org_demo' },
    update: {},
    create: {
      name: 'Demo Law Firm',
      clerkOrgId: 'org_demo',
      plan: Plan.PRO,
    },
  });
  console.log(`✅ Created organization: ${demoOrg.name}`);

  // Create demo users
  const adminUser = await prisma.user.upsert({
    where: { clerkUserId: 'user_demo_admin' },
    update: {},
    create: {
      clerkUserId: 'user_demo_admin',
      email: 'admin@demolawfirm.com',
      role: Role.ADMIN,
      organizationId: demoOrg.id,
    },
  });

  const analystUser = await prisma.user.upsert({
    where: { clerkUserId: 'user_demo_analyst' },
    update: {},
    create: {
      clerkUserId: 'user_demo_analyst',
      email: 'analyst@demolawfirm.com',
      role: Role.ANALYST,
      organizationId: demoOrg.id,
    },
  });
  console.log(`✅ Created ${2} demo users`);

  // Sample NHTSA-style complaints
  const sampleComplaints = [
    {
      nhtsaId: 'CMPL_DEMO_001',
      odiNumber: '11234567',
      manufacturer: 'TOYOTA MOTOR CORPORATION',
      make: 'TOYOTA',
      model: 'CAMRY',
      year: 2020,
      component: 'AIR BAGS',
      description:
        'THE AIRBAG WARNING LIGHT ILLUMINATED ON THE DASHBOARD. UPON INSPECTION, THE DEALER STATED THAT THE AIRBAG SENSOR WAS FAULTY AND NEEDED REPLACEMENT. THE VEHICLE HAS APPROXIMATELY 25,000 MILES.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-06-15'),
    },
    {
      nhtsaId: 'CMPL_DEMO_002',
      odiNumber: '11234568',
      manufacturer: 'TOYOTA MOTOR CORPORATION',
      make: 'TOYOTA',
      model: 'CAMRY',
      year: 2021,
      component: 'AIR BAGS',
      description:
        'WHILE DRIVING, THE AIRBAG DEPLOYED WITHOUT ANY COLLISION OR IMPACT. THE VEHICLE WAS TRAVELING AT APPROXIMATELY 45 MPH ON A HIGHWAY. THE DEPLOYMENT CAUSED THE DRIVER TO LOSE CONTROL MOMENTARILY.',
      crash: true,
      fire: false,
      injuries: 1,
      deaths: 0,
      dateAdded: new Date('2023-08-22'),
    },
    {
      nhtsaId: 'CMPL_DEMO_003',
      odiNumber: '11234569',
      manufacturer: 'TOYOTA MOTOR CORPORATION',
      make: 'TOYOTA',
      model: 'RAV4',
      year: 2019,
      component: 'FUEL SYSTEM',
      description:
        'STRONG FUEL ODOR DETECTED INSIDE AND OUTSIDE THE VEHICLE. DEALER INSPECTION FOUND A CRACK IN THE FUEL TANK. THE VEHICLE HAS BEEN PARKED DUE TO FIRE RISK CONCERNS.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-07-10'),
    },
    {
      nhtsaId: 'CMPL_DEMO_004',
      odiNumber: '11234570',
      manufacturer: 'FORD MOTOR COMPANY',
      make: 'FORD',
      model: 'F-150',
      year: 2022,
      component: 'ENGINE AND ENGINE COOLING',
      description:
        'ENGINE CAUGHT FIRE WHILE PARKED IN DRIVEWAY. NO ONE WAS IN THE VEHICLE. FIRE DEPARTMENT RESPONDED AND EXTINGUISHED THE FIRE. TOTAL LOSS OF VEHICLE.',
      crash: false,
      fire: true,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-09-05'),
    },
    {
      nhtsaId: 'CMPL_DEMO_005',
      odiNumber: '11234571',
      manufacturer: 'FORD MOTOR COMPANY',
      make: 'FORD',
      model: 'F-150',
      year: 2021,
      component: 'ENGINE AND ENGINE COOLING',
      description:
        'WHILE DRIVING, SMOKE BEGAN COMING FROM UNDER THE HOOD. PULLED OVER AND ENGINE COMPARTMENT WAS ON FIRE. OCCUPANTS ESCAPED SAFELY. VEHICLE WAS DESTROYED.',
      crash: false,
      fire: true,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-09-18'),
    },
    {
      nhtsaId: 'CMPL_DEMO_006',
      odiNumber: '11234572',
      manufacturer: 'GENERAL MOTORS LLC',
      make: 'CHEVROLET',
      model: 'SILVERADO',
      year: 2020,
      component: 'STEERING',
      description:
        'SUDDEN LOSS OF POWER STEERING ASSIST WHILE DRIVING. THE STEERING BECAME VERY DIFFICULT TO TURN. THIS HAS HAPPENED MULTIPLE TIMES, ESPECIALLY AT LOW SPEEDS.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-10-01'),
    },
    {
      nhtsaId: 'CMPL_DEMO_007',
      odiNumber: '11234573',
      manufacturer: 'TESLA, INC.',
      make: 'TESLA',
      model: 'MODEL 3',
      year: 2022,
      component: 'ELECTRICAL SYSTEM',
      description:
        'TOUCHSCREEN WENT COMPLETELY BLACK WHILE DRIVING. UNABLE TO ACCESS VEHICLE CONTROLS, NAVIGATION, OR CLIMATE. HAD TO PULL OVER AND RESTART THE VEHICLE.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-10-15'),
    },
    {
      nhtsaId: 'CMPL_DEMO_008',
      odiNumber: '11234574',
      manufacturer: 'HONDA MOTOR CO.',
      make: 'HONDA',
      model: 'ACCORD',
      year: 2023,
      component: 'BRAKES',
      description:
        'BRAKE PEDAL WENT TO THE FLOOR WITH MINIMAL STOPPING POWER. NEARLY CAUSED A COLLISION AT AN INTERSECTION. DEALER FOUND AIR IN BRAKE LINES AND BLED THE SYSTEM.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-11-02'),
    },
    {
      nhtsaId: 'CMPL_DEMO_009',
      odiNumber: '11234575',
      manufacturer: 'TOYOTA MOTOR CORPORATION',
      make: 'TOYOTA',
      model: 'CAMRY',
      year: 2020,
      component: 'AIR BAGS',
      description:
        'AIRBAG DID NOT DEPLOY DURING A FRONTAL COLLISION. THE VEHICLE STRUCK ANOTHER CAR AT APPROXIMATELY 30 MPH. DRIVER SUSTAINED INJURIES THAT MAY HAVE BEEN PREVENTED.',
      crash: true,
      fire: false,
      injuries: 2,
      deaths: 0,
      dateAdded: new Date('2023-11-10'),
    },
    {
      nhtsaId: 'CMPL_DEMO_010',
      odiNumber: '11234576',
      manufacturer: 'FORD MOTOR COMPANY',
      make: 'FORD',
      model: 'F-150',
      year: 2022,
      component: 'ENGINE AND ENGINE COOLING',
      description:
        'ENGINE STALLED WHILE DRIVING ON HIGHWAY. COULD NOT RESTART. TOWED TO DEALER WHO FOUND ENGINE SEIZED DUE TO OIL PUMP FAILURE. 35,000 MILES ON VEHICLE.',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2023-11-20'),
    },
  ];

  // Insert complaints
  for (const complaint of sampleComplaints) {
    await prisma.complaint.upsert({
      where: { nhtsaId: complaint.nhtsaId },
      update: {},
      create: complaint,
    });
  }
  console.log(`✅ Created ${sampleComplaints.length} sample complaints`);

  // Create sample patterns
  const toyotaAirbagPattern = await prisma.pattern.create({
    data: {
      name: 'Toyota Camry Airbag Issues (2020-2021)',
      description:
        'Multiple reports of airbag malfunctions in Toyota Camry models, including spontaneous deployment and failure to deploy during collisions.',
      make: 'TOYOTA',
      model: 'CAMRY',
      yearStart: 2020,
      yearEnd: 2021,
      component: 'AIR BAGS',
      complaintCount: 3,
      crashCount: 2,
      fireCount: 0,
      injuryCount: 3,
      deathCount: 0,
      severityScore: 75.5,
      trendScore: 45.2,
      firstSeen: new Date('2023-06-15'),
      lastUpdated: new Date(),
      isActive: true,
      organizationId: null, // Global pattern
    },
  });

  const fordEnginePattern = await prisma.pattern.create({
    data: {
      name: 'Ford F-150 Engine Fires (2021-2022)',
      description:
        'Reports of engine fires in Ford F-150 trucks, occurring both while driving and while parked. Potential engine compartment defect.',
      make: 'FORD',
      model: 'F-150',
      yearStart: 2021,
      yearEnd: 2022,
      component: 'ENGINE AND ENGINE COOLING',
      complaintCount: 3,
      crashCount: 0,
      fireCount: 2,
      injuryCount: 0,
      deathCount: 0,
      severityScore: 82.3,
      trendScore: 68.9,
      firstSeen: new Date('2023-09-05'),
      lastUpdated: new Date(),
      isActive: true,
      organizationId: null, // Global pattern
    },
  });
  console.log(`✅ Created ${2} sample patterns`);

  // Link complaints to patterns
  await prisma.complaint.updateMany({
    where: {
      make: 'TOYOTA',
      model: 'CAMRY',
      component: 'AIR BAGS',
    },
    data: {
      clusterId: toyotaAirbagPattern.id,
    },
  });

  await prisma.complaint.updateMany({
    where: {
      make: 'FORD',
      model: 'F-150',
      component: 'ENGINE AND ENGINE COOLING',
    },
    data: {
      clusterId: fordEnginePattern.id,
    },
  });
  console.log(`✅ Linked complaints to patterns`);

  // Create a sample generated complaint
  await prisma.generatedComplaint.create({
    data: {
      patternId: toyotaAirbagPattern.id,
      organizationId: demoOrg.id,
      title: 'Class Action Complaint - Toyota Camry Airbag Defects',
      content: {
        caption: 'IN THE UNITED STATES DISTRICT COURT FOR THE CENTRAL DISTRICT OF CALIFORNIA',
        parties: {
          plaintiffs: 'JOHN DOE, individually and on behalf of all others similarly situated',
          defendants: 'TOYOTA MOTOR CORPORATION, a Japanese Corporation',
        },
        natureOfAction:
          'This is a class action lawsuit brought on behalf of all persons who purchased or leased 2020-2021 Toyota Camry vehicles equipped with defective airbag systems...',
        counts: [
          {
            number: 1,
            title: 'Breach of Implied Warranty of Merchantability',
            allegations:
              'Defendant breached the implied warranty of merchantability by selling vehicles with defective airbag systems...',
          },
          {
            number: 2,
            title: 'Violation of Consumer Protection Laws',
            allegations:
              'Defendant engaged in unfair and deceptive trade practices by concealing known airbag defects...',
          },
        ],
        prayer:
          'WHEREFORE, Plaintiffs pray for judgment against Defendant as follows: (a) Certification of this action as a class action; (b) Compensatory damages; (c) Punitive damages...',
      },
      status: ComplaintStatus.DRAFT,
      version: 1,
      createdBy: adminUser.clerkUserId,
    },
  });
  console.log(`✅ Created 1 sample generated complaint`);

  // Create audit log entries
  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: demoOrg.id,
        userId: adminUser.clerkUserId,
        action: 'CREATE',
        resource: 'generated_complaint',
        resourceId: '1',
        metadata: { title: 'Class Action Complaint - Toyota Camry Airbag Defects' },
      },
      {
        organizationId: demoOrg.id,
        userId: analystUser.clerkUserId,
        action: 'VIEW',
        resource: 'pattern',
        resourceId: toyotaAirbagPattern.id,
        metadata: { patternName: toyotaAirbagPattern.name },
      },
    ],
  });
  console.log(`✅ Created sample audit logs`);

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
