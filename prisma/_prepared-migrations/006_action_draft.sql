-- 006_action_draft.sql
-- M6: new ActionDraft table — the editable step-1 output of a Quick Action,
-- saved before it's run into a finished deliverable.
--
--   skill     -> the generatedFromSkill value (which Quick Action produced it)
--   content   -> editable step-1 output (JSON; shape varies by skill)
--   status    -> "draft" by default
--   createdBy -> partner name or "AGENT · CLAUDE"
--   clientId / dealId / contactId / projectId -> nullable scope FKs (one
--     expected at write time), each ON DELETE SET NULL ON UPDATE CASCADE to
--     match the loose-coupling convention used by Artifact / Task scope FKs.

-- CreateTable
CREATE TABLE "ActionDraft" (
    "id" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "clientId" TEXT,
    "dealId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionDraft_clientId_idx" ON "ActionDraft"("clientId");

-- CreateIndex
CREATE INDEX "ActionDraft_dealId_idx" ON "ActionDraft"("dealId");

-- CreateIndex
CREATE INDEX "ActionDraft_contactId_idx" ON "ActionDraft"("contactId");

-- CreateIndex
CREATE INDEX "ActionDraft_projectId_idx" ON "ActionDraft"("projectId");

-- CreateIndex
CREATE INDEX "ActionDraft_skill_idx" ON "ActionDraft"("skill");

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
