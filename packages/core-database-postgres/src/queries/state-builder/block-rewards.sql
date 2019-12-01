SELECT generator_public_key,
       SUM ("reward" + "total_fee" + "top_reward") AS "reward"
FROM blocks
GROUP BY "generator_public_key"
