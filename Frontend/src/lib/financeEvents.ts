type FinanceDataListener = () => void;

const listeners = new Set<FinanceDataListener>();

export function subscribeFinanceDataChanged(listener: FinanceDataListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyFinanceDataChanged(): void {
  listeners.forEach((listener) => listener());
}
