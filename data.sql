-- TerraGrow data model reference (documentation only).
-- Runtime data is stored in the CSV files inside /data.
-- No MySQL server or MySQL Workbench is used by this project.

-- users.csv:
-- userId, name, role, email, passwordHash, phone, location, createdAt

-- crops.csv:
-- cropId, cropName, typicalNPK, recommendedFertilizers, notes, createdAt

-- fertilizers.csv:
-- fertilizerId, name, nutrientComposition, type, instructions, createdAt

-- rules.csv:
-- ruleId, cropId, ruleName, conditionData, recommendations,
-- isActive, updatedBy, createdAt, updatedAt

-- recommendations.csv:
-- recId, userId, cropId, cropName, soilInput, growthStage, area,
-- areaUnit, generatedRecommendations, isSaved, generatedAt, savedAt

-- feedback.csv:
-- feedbackId, recId, userId, rating, comments, createdAt


-- Admin extension fields (the running application stores these in CSV files):
-- fertilizers.csv adds:
--   defaultDosageKgPerHa, applicationTiming
-- feedback.csv adds:
--   reviewStatus (Pending / Reviewed / Actioned), adminNote, reviewedAt
-- crop profiles store editable N/P/K cut-offs and pH range inside typicalNPK JSON.
-- Rule conditions and fertilizer recommendations are stored as JSON in rules.csv.
