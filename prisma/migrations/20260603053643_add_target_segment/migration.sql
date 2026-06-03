-- CreateTable
CREATE TABLE "TargetSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "industries" TEXT[],
    "revenueMin" INTEGER,
    "revenueMax" INTEGER,
    "employeeMin" INTEGER,
    "employeeMax" INTEGER,
    "geographies" TEXT[],
    "buyerPersonas" TEXT[],
    "buyingSignals" TEXT[],
    "disqualifiers" TEXT[],
    "searchSpec" JSONB,
    "anchorCompanies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TargetSegment_active_priority_idx" ON "TargetSegment"("active", "priority");
