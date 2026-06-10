-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('works_there', 'introduced_us', 'advisor', 'other');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('decision_maker', 'champion', 'influencer', 'budget_holder', 'technical', 'gatekeeper', 'blocker', 'other');

-- CreateEnum
CREATE TYPE "PreferredChannel" AS ENUM ('email', 'call', 'text', 'linkedin');

-- CreateEnum
CREATE TYPE "RelationshipStrength" AS ENUM ('cold', 'warm', 'strong');

-- CreateEnum
CREATE TYPE "DiscoverySurveyStatus" AS ENUM ('draft', 'sent', 'responded');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "competitors" TEXT[],
ADD COLUMN     "currentSystems" TEXT[],
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "keyServices" TEXT[],
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "locations" TEXT,
ADD COLUMN     "painPoints" TEXT[],
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "revenueEstimate" INTEGER,
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "subIndustry" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "importantDates" TEXT[],
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "preferredChannel" "PreferredChannel",
ADD COLUMN     "relationshipStrength" "RelationshipStrength",
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "budget" TEXT,
ADD COLUMN     "companyKeyFacts" TEXT[],
ADD COLUMN     "companySize" TEXT,
ADD COLUMN     "competitor" TEXT,
ADD COLUMN     "currentSystems" TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "founded" TEXT,
ADD COLUMN     "headquarters" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "ownership" TEXT,
ADD COLUMN     "painPoints" TEXT[],
ADD COLUMN     "probability" INTEGER,
ADD COLUMN     "revenueEstimate" INTEGER,
ADD COLUMN     "subIndustry" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientLeadId" TEXT,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "risks" TEXT[],
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "successMetrics" TEXT[],
ADD COLUMN     "systemsBuilt" TEXT[];

-- CreateTable
CREATE TABLE "ContactLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dealId" TEXT,
    "clientId" TEXT,
    "relationship" "RelationshipType" NOT NULL DEFAULT 'works_there',
    "role" "StakeholderRole",
    "roleLabel" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySurvey" (
    "id" TEXT NOT NULL,
    "status" "DiscoverySurveyStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "tallyFormId" TEXT,
    "tallyFormUrl" TEXT,
    "answers" JSONB,
    "respondentName" TEXT,
    "respondentEmail" TEXT,
    "submittedAt" TIMESTAMP(3),
    "driveUrl" TEXT,
    "externalSubmissionId" TEXT,
    "dealId" TEXT,
    "clientId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverySurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactLink_dealId_idx" ON "ContactLink"("dealId");

-- CreateIndex
CREATE INDEX "ContactLink_clientId_idx" ON "ContactLink"("clientId");

-- CreateIndex
CREATE INDEX "ContactLink_contactId_idx" ON "ContactLink"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLink_contactId_dealId_key" ON "ContactLink"("contactId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLink_contactId_clientId_key" ON "ContactLink"("contactId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySurvey_tallyFormId_key" ON "DiscoverySurvey"("tallyFormId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySurvey_externalSubmissionId_key" ON "DiscoverySurvey"("externalSubmissionId");

-- CreateIndex
CREATE INDEX "DiscoverySurvey_dealId_createdAt_idx" ON "DiscoverySurvey"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoverySurvey_clientId_createdAt_idx" ON "DiscoverySurvey"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoverySurvey_status_idx" ON "DiscoverySurvey"("status");

-- AddForeignKey
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverySurvey" ADD CONSTRAINT "DiscoverySurvey_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverySurvey" ADD CONSTRAINT "DiscoverySurvey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientLeadId_fkey" FOREIGN KEY ("clientLeadId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
