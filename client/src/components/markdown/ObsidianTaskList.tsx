import React from 'react';

interface ObsidianTaskListProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  readOnly?: boolean;
}

export const ObsidianTaskList: React.FC<ObsidianTaskListProps> = ({
  checked,
  onChange,
  children,
  readOnly = false
}) => {
  const handleClick = () => {
    if (!readOnly) {
      onChange(!checked);
    }
  };

  return (
    <li className="obsidian-task-list-item" style={{ listStyleType: 'none', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          className={`obsidian-checkbox ${checked ? 'checked' : ''}`}
          style={{
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '1.2em',
            height: '1.2em',
            marginRight: '8px',
            borderRadius: '3px',
            border: `1px solid var(--primary-color, #00E0FF)`,
            backgroundColor: checked ? 'rgba(0, 224, 255, 0.2)' : 'transparent',
            color: 'var(--primary-color, #00E0FF)',
            cursor: readOnly ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {checked ? '✓' : ''}
        </div>
        <span
          style={{
            textDecoration: checked ? 'line-through' : 'none',
            opacity: checked ? 0.7 : 1,
          }}
        >
          {children}
        </span>
      </div>
    </li>
  );
};

export default ObsidianTaskList;