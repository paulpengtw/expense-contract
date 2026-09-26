# Household vocabulary

The stable names below are the contract vocabulary. These are column names and semantic terms, not an exhaustive enum of household values. Categories, accounts, partners, and enabled options still come from the relevant spreadsheet at runtime.

The common journal core in both ledgers is `txn_id`, `日期`, `金額`, `分類`, `交易對象`, `來源`, and `沖銷txn_id`. `txn_id` is the stored transaction identifier and, on covered write paths, the durable idempotency key. `日期` is the date; `金額` is a native amount; `分類` is the category name; `交易對象` is the counterparty; `來源` identifies origin; `沖銷txn_id` links a reversal to its target.

Partner allocation uses `付款人` (payer), `分攤方式` (allocation mode), and `記帳人` (recorder). Its current split choices are `這筆平分`, `幫狗狗付`, and `幫自己付`; the `結清` marker identifies settlement. The source is partner-ledger `ENTRY_HEADERS` and `SPLIT_MODES` in `apps-script/Code.gs`.

Solo journal entries use `時間`, `類型`, `借方帳戶`, `貸方帳戶`, `幣別`, `說明`, `結清狀態`, and `建立時間`. `借方帳戶` and `貸方帳戶` form the journal legs; `幣別` identifies native currency; `結清狀態` is derived settlement status. Its transaction types include `支出`, `收入`, and `轉帳`, with IOU types `應收` and `應付`. The source is solo-ledger `JOURNAL_HEADERS` and `functions/lib/validate.ts`.

The web importer uses `分類`, `幣別`, `金額`, and `帳戶金額` from Moneybook CSV headers in `web/src/import/read.ts`. The PWA's `create` payload uses `payer`, `bearer`, `amount`, `currency`, `category`, `description`, and `paymentMethod`; its fixture at expense-pwa commit `51b55b77f773e13fb0a8dd5e7896bf56f7502fab` fixes that shape. The PWA projection names payload fields rather than inventing Chinese sheet columns. No consumer receives another consumer's extra terms. Adoption must still verify every consumer's complete source use against these projections.
