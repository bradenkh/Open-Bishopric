-- Update is_household_parent and age columns
-- This will be generated from roster.local.json data

-- For now, since Supabase's schema cache is being problematic,
-- we'll verify the columns exist and can be updated
SELECT column_name FROM information_schema.columns
WHERE table_name = 'members' AND column_name IN ('is_household_parent', 'age', 'is_head_of_household', 'household_id');
