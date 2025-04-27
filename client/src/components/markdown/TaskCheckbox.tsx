import React, { useState } from 'react';

interface TaskCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const TaskCheckbox: React.FC<TaskCheckboxProps> = ({
  checked: initialChecked,
  onChange,
  disabled = false,
}) => {
  const [isChecked, setIsChecked] = useState(initialChecked);

  const handleClick = () => {
    if (disabled) return;
    
    const newState = !isChecked;
    setIsChecked(newState);
    onChange(newState);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <span
      role="checkbox"
      aria-checked={isChecked}
      tabIndex={disabled ? -1 : 0}
      className={`task-checkbox ${isChecked ? 'checked' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '1.2em',
        height: '1.2em',
        border: `1px solid var(--primary-color, #00E0FF)`,
        borderRadius: '0.2em',
        marginRight: '0.5em',
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor: isChecked ? 'rgba(var(--primary-rgb, 0, 224, 255), 0.2)' : 'transparent',
        transition: 'all 0.15s ease-in-out',
        position: 'relative',
      }}
    >
      {isChecked && "✓"}
    </span>
  );
};

export default TaskCheckbox;