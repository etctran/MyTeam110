-- Renames isSenior to isReturning. A plain column rename (not drop+add)
-- so existing seeded data survives -- "senior" and "returning TA" were
-- always the same underlying concept (gates shift-lead eligibility);
-- this just makes the name match the domain language.
ALTER TABLE "User" RENAME COLUMN "isSenior" TO "isReturning";
