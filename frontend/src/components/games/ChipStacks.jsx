import { inventoryToGroups, rackChipCount, rackTotal } from '../../utils/chipUtils';

/** Physical chip stacks — stack value shown large beside columns, not crammed on discs. */
export default function ChipStacks({ inventory, variant = 'table' }) {
  const groups = inventoryToGroups(inventory, variant === 'pot' ? 10 : 6);
  const total = rackTotal(inventory);
  const nChips = rackChipCount(inventory);
  const isPot = variant === 'pot';

  if (!inventory || nChips === 0) {
    return <span className="pk-chip-empty">{isPot ? '—' : '0'}</span>;
  }

  const chipH = isPot ? 11 : 14;
  const chipStep = isPot ? 4 : 5;
  const colW = isPot ? 32 : 40;

  return (
    <div className={`pk-chip-area pk-chip-area--${variant}`}>
      {!isPot && <span className="pk-stack-value">{total.toLocaleString()}</span>}
      <div className="pk-chip-stacks">
        {groups.map(({ denom, count, overflow }) => (
          <div
            key={denom.value}
            className="pk-chip-column"
            style={{ width: colW, minHeight: chipH + count * chipStep }}
            title={`${count + overflow} × $${denom.value}`}
          >
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="pk-chip"
                style={{
                  background: denom.color,
                  borderColor: denom.rim,
                  color: denom.text || '#fff',
                  bottom: i * chipStep,
                  zIndex: i,
                  height: chipH,
                }}
              >
                {count <= 2 || i === count - 1 ? denom.label : ''}
              </div>
            ))}
            {overflow > 0 && <span className="pk-chip-badge">+{overflow}</span>}
          </div>
        ))}
      </div>
      {isPot && <span className="pk-pot-value">{total.toLocaleString()}</span>}
    </div>
  );
}
