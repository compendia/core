SELECT SUM ("number_of_transactions") AS "numberOfTransactions",
       SUM ("total_fee") AS "totalFee",
       SUM ("removed_fee") AS "removedFee",
       SUM ("total_amount") AS "totalAmount",
       COUNT (DISTINCT "height") AS "count"
FROM blocks
