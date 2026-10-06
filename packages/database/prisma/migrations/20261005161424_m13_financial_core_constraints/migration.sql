-- M13 Financial Core Constraints

-- 1. Ensure amount > 0 at all times for ledger entries.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);

-- 2. Prevent mutation of ledger entries if the parent transaction is already COMPLETED.
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
DECLARE
    tx_status "TxStatus";
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        SELECT status INTO tx_status FROM "financial_transactions" WHERE id = NEW."transactionId";
    ELSE
        SELECT status INTO tx_status FROM "financial_transactions" WHERE id = OLD."transactionId";
    END IF;

    IF tx_status = 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot modify ledger entries for a completed financial transaction.';
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- 3. Verify double-entry balance at commit time for COMPLETED transactions
CREATE OR REPLACE FUNCTION verify_financial_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debit BIGINT := 0;
    total_credit BIGINT := 0;
    debit_count INT := 0;
    credit_count INT := 0;
BEGIN
    IF NEW.status = 'COMPLETED' THEN
        SELECT 
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEBIT'), 0),
            COALESCE(SUM(amount) FILTER (WHERE type = 'CREDIT'), 0),
            COUNT(*) FILTER (WHERE type = 'DEBIT'),
            COUNT(*) FILTER (WHERE type = 'CREDIT')
        INTO 
            total_debit, total_credit, debit_count, credit_count
        FROM "ledger_entries"
        WHERE "transactionId" = NEW.id;

        IF debit_count = 0 OR credit_count = 0 THEN
            RAISE EXCEPTION 'FinancialTransaction % cannot be completed without at least one DEBIT and CREDIT entry.', NEW.id;
        END IF;

        IF total_debit != total_credit THEN
            RAISE EXCEPTION 'FinancialTransaction % is unbalanced: DEBIT (%) != CREDIT (%)', NEW.id, total_debit, total_credit;
        END IF;

        IF total_debit <= 0 THEN
            RAISE EXCEPTION 'FinancialTransaction % has invalid total amount: %', NEW.id, total_debit;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Use an INITIALLY DEFERRED constraint trigger so it fires at COMMIT
CREATE CONSTRAINT TRIGGER financial_transaction_balance_trigger
AFTER INSERT OR UPDATE ON "financial_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_financial_transaction_balance();