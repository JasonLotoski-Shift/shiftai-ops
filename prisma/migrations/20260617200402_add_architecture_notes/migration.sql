-- CreateTable
CREATE TABLE "ArchitectureNote" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchitectureNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArchitectureNote_nodeId_createdAt_idx" ON "ArchitectureNote"("nodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ArchitectureNote" ADD CONSTRAINT "ArchitectureNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
