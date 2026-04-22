import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  mono?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, mono, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="input-field">
        {label && <label className="input-field__label">{label}</label>}
        <div className={`input-field__wrap ${error ? 'input-field__wrap--error' : ''}`}>
          {leftIcon && <span className="input-field__icon">{leftIcon}</span>}
          <input
            ref={ref}
            className={`input-field__input ${mono ? 'mono' : ''} ${className}`}
            {...props}
          />
          {rightIcon && <span className="input-field__icon input-field__icon--right">{rightIcon}</span>}
        </div>
        {error ? <p className="input-field__error">{error}</p> : hint && <p className="input-field__hint">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
