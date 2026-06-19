-- Add the `contract` value to ArtifactType so the Generate Contract Quick Action
-- can tag its deliverable distinctly from `sow`. Additive, non-destructive.
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'contract';
