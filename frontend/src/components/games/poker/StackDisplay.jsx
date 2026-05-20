import { inventoryToGroups, rackTotal } from '../../../utils/chipUtils';

/** Pixel stack readout: total + up to two chip discs. */
export default function StackDisplay({ inventory, variant = 'seat' }) {
  const total = rackTotal(inventory);
  const groups = inventoryToGroups(inventory, 1).slice(0, 2);

  if (!total) {
    return (
      <div className={`pk-stack-display pk-stack-display--${variant}`}>
        <span className="pk-stack-display-amt">0</span>
      </div>
    );
  }

  return (
    <div className={`pk-stack-display pk-stack-display--${variant}`}>
      <span className="pk-stack-display-amt">{total.toLocaleString()}</span>
      {variant === 'seat' && groups.length > 0 && (
        <div className="pk-stack-display-chips" aria-hidden="true">
          {groups.map(({ denom }) => (
            <span
              key={denom.value}
              className="pk-stack-display-disc"
              style={{ background: denom.color, borderColor: denom.rim }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
