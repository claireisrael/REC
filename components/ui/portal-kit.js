"use client"

import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react"

function cx(...values) {
  return values.flat().filter(Boolean).join(" ")
}

function responsiveClasses(prefix, values) {
  return ["xs", "sm", "md", "lg", "xl", "xxl"].flatMap((breakpoint) => {
    const value = values[breakpoint]
    if (value == null || value === false) return []

    const infix = breakpoint === "xs" ? "" : `-${breakpoint}`
    if (value === true) return [`${prefix}${infix}`]
    if (typeof value !== "object") return [`${prefix}${infix}-${value}`]

    return [
      value.span != null && `${prefix}${infix}-${value.span}`,
      value.offset != null && `offset${infix}-${value.offset}`,
      value.order != null && `order${infix}-${value.order}`,
    ].filter(Boolean)
  })
}

export const Container = forwardRef(function Container(
  { as: Component = "div", fluid, className, ...props },
  ref,
) {
  const containerClass = fluid === true ? "container-fluid" : fluid ? `container-${fluid}` : "container"
  return <Component ref={ref} className={cx(containerClass, className)} {...props} />
})

export const Row = forwardRef(function Row(
  { as: Component = "div", className, xs, sm, md, lg, xl, xxl, ...props },
  ref,
) {
  const rowColumns = { xs, sm, md, lg, xl, xxl }
  const classes = Object.entries(rowColumns)
    .filter(([, value]) => value != null)
    .map(([breakpoint, value]) => `row-cols${breakpoint === "xs" ? "" : `-${breakpoint}`}-${value}`)

  return <Component ref={ref} className={cx("row", classes, className)} {...props} />
})

export const Col = forwardRef(function Col(
  { as: Component = "div", className, xs, sm, md, lg, xl, xxl, ...props },
  ref,
) {
  const sizing = { xs, sm, md, lg, xl, xxl }
  const hasSizing = Object.values(sizing).some((value) => value != null && value !== false)
  return (
    <Component
      ref={ref}
      className={cx(hasSizing ? responsiveClasses("col", sizing) : "col", className)}
      {...props}
    />
  )
})

export const Button = forwardRef(function Button(
  {
    as,
    variant = "primary",
    size,
    active,
    disabled,
    href,
    className,
    type,
    onClick,
    ...props
  },
  ref,
) {
  const Component = as || (href ? "a" : "button")
  const isButton = Component === "button"
  const handleClick = (event) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <Component
      ref={ref}
      className={cx("btn", variant && `btn-${variant}`, size && `btn-${size}`, active && "active", className)}
      href={href}
      type={isButton ? type || "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-disabled={!isButton && disabled ? true : undefined}
      tabIndex={!isButton && disabled ? -1 : props.tabIndex}
      onClick={handleClick}
      {...props}
    />
  )
})

export const ButtonGroup = forwardRef(function ButtonGroup(
  { as: Component = "div", vertical, size, className, role = "group", ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      role={role}
      className={cx(vertical ? "btn-group-vertical" : "btn-group", size && `btn-group-${size}`, className)}
      {...props}
    />
  )
})

function CardRoot({ as: Component = "div", bg, text, border, body, className, children, ...props }) {
  const content = body ? <CardBody>{children}</CardBody> : children
  return (
    <Component
      className={cx("card", bg && `bg-${bg}`, text && `text-${text}`, border && `border-${border}`, className)}
      {...props}
    >
      {content}
    </Component>
  )
}

function cardPart(defaultElement, baseClass) {
  return function CardPart({ as: Component = defaultElement, className, ...props }) {
    return <Component className={cx(baseClass, className)} {...props} />
  }
}

const CardHeader = cardPart("div", "card-header")
const CardBody = cardPart("div", "card-body")
const CardFooter = cardPart("div", "card-footer")
const CardTitle = cardPart("h5", "card-title")
const CardSubtitle = cardPart("h6", "card-subtitle")
const CardText = cardPart("p", "card-text")

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
  Title: CardTitle,
  Subtitle: CardSubtitle,
  Text: CardText,
})

function AlertRoot({ variant = "primary", dismissible, onClose, show = true, className, children, ...props }) {
  if (!show) return null
  return (
    <div role="alert" className={cx("alert", `alert-${variant}`, dismissible && "alert-dismissible", className)} {...props}>
      {children}
      {dismissible ? (
        <button type="button" className="portal-alert-close" aria-label="Close alert" onClick={onClose}>
          <X size={17} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

const AlertHeading = cardPart("h4", "alert-heading")
export const Alert = Object.assign(AlertRoot, { Heading: AlertHeading })

export function Badge({ as: Component = "span", bg, variant, pill, className, ...props }) {
  const tone = bg || variant || "primary"
  return <Component className={cx("badge", `bg-${tone}`, pill && "rounded-pill", className)} {...props} />
}

export function Spinner({ animation = "border", size, variant, className, children, ...props }) {
  return (
    <span
      className={cx(
        animation === "grow" ? "spinner-grow" : "spinner-border",
        size && `${animation === "grow" ? "spinner-grow" : "spinner-border"}-${size}`,
        variant && `text-${variant}`,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function ProgressBar({
  min = 0,
  max = 100,
  now = 0,
  label,
  visuallyHidden,
  variant,
  striped,
  animated,
  className,
  style,
  barClassName,
  ...props
}) {
  const safeMax = max > min ? max : min + 1
  const percent = Math.max(0, Math.min(100, ((Number(now) - min) / (safeMax - min)) * 100))
  return (
    <div className={cx("progress", className)} style={style} {...props}>
      <div
        className={cx(
          "progress-bar portal-progress-bar",
          variant && `bg-${variant}`,
          striped && "progress-bar-striped",
          animated && "progress-bar-animated",
          barClassName,
        )}
        role="progressbar"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={now}
        style={{ width: `${percent}%` }}
      >
        {visuallyHidden ? <span className="visually-hidden">{label}</span> : label}
      </div>
    </div>
  )
}

export const Table = forwardRef(function Table(
  {
    as: Component = "table",
    striped,
    bordered,
    borderless,
    hover,
    size,
    variant,
    responsive,
    className,
    ...props
  },
  ref,
) {
  const table = (
    <Component
      ref={ref}
      className={cx(
        "table",
        striped && "table-striped",
        bordered && "table-bordered",
        borderless && "table-borderless",
        hover && "table-hover",
        size && `table-${size}`,
        variant && `table-${variant}`,
        className,
      )}
      {...props}
    />
  )

  if (!responsive) return table
  return <div className={responsive === true ? "table-responsive" : `table-responsive-${responsive}`}>{table}</div>
})

const FormGroupContext = createContext(null)

const FormGroup = forwardRef(function FormGroup(
  { as: Component = "div", controlId, className, ...props },
  ref,
) {
  return (
    <FormGroupContext.Provider value={controlId || null}>
      <Component ref={ref} className={className} {...props} />
    </FormGroupContext.Provider>
  )
})

const FormLabel = forwardRef(function FormLabel(
  { as: Component = "label", htmlFor, column, visuallyHidden, className, ...props },
  ref,
) {
  const controlId = useContext(FormGroupContext)
  return (
    <Component
      ref={ref}
      htmlFor={htmlFor || controlId || undefined}
      className={cx(column ? "col-form-label" : "form-label", visuallyHidden && "visually-hidden", className)}
      {...props}
    />
  )
})

const FormFeedback = forwardRef(function FormFeedback(
  { as: Component = "div", type = "valid", tooltip, className, ...props },
  ref,
) {
  return <Component ref={ref} className={cx(`${type}-${tooltip ? "tooltip" : "feedback"}`, className)} {...props} />
})

const FormControl = forwardRef(function FormControl(
  {
    as: Component = "input",
    id,
    type,
    size,
    htmlSize,
    plaintext,
    isValid,
    isInvalid,
    className,
    ...props
  },
  ref,
) {
  const controlId = useContext(FormGroupContext)
  const isSelect = Component === "select"
  return (
    <Component
      ref={ref}
      id={id || controlId || undefined}
      type={Component === "input" ? type : undefined}
      size={htmlSize}
      aria-invalid={isInvalid ? true : undefined}
      className={cx(
        plaintext ? "form-control-plaintext" : isSelect ? "form-select" : "form-control",
        size && `${isSelect ? "form-select" : "form-control"}-${size}`,
        isValid && "is-valid",
        isInvalid && "is-invalid",
        className,
      )}
      {...props}
    />
  )
})
FormControl.Feedback = FormFeedback

const FormSelect = forwardRef(function FormSelect(
  { id, size, isValid, isInvalid, className, ...props },
  ref,
) {
  const controlId = useContext(FormGroupContext)
  return (
    <select
      ref={ref}
      id={id || controlId || undefined}
      aria-invalid={isInvalid ? true : undefined}
      className={cx(
        "form-select",
        size && `form-select-${size}`,
        isValid && "is-valid",
        isInvalid && "is-invalid",
        className,
      )}
      {...props}
    />
  )
})

const FormCheckInput = forwardRef(function FormCheckInput(
  { type = "checkbox", isValid, isInvalid, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type === "switch" ? "checkbox" : type}
      className={cx("form-check-input", isValid && "is-valid", isInvalid && "is-invalid", className)}
      {...props}
    />
  )
})

const FormCheckLabel = forwardRef(function FormCheckLabel({ className, ...props }, ref) {
  return <label ref={ref} className={cx("form-check-label", className)} {...props} />
})

const FormCheck = forwardRef(function FormCheck(
  {
    id,
    type = "checkbox",
    label,
    children,
    inline,
    reverse,
    disabled,
    isValid,
    isInvalid,
    feedback,
    feedbackType = "valid",
    feedbackTooltip,
    className,
    inputClassName,
    labelClassName,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id || `portal-check-${generatedId.replace(/:/g, "")}`
  const labelContent = label ?? children
  return (
    <div
      className={cx(
        "form-check",
        type === "switch" && "form-switch",
        inline && "form-check-inline",
        reverse && "form-check-reverse",
        className,
      )}
    >
      <FormCheckInput
        ref={ref}
        id={inputId}
        type={type}
        disabled={disabled}
        isValid={isValid}
        isInvalid={isInvalid}
        className={inputClassName}
        {...props}
      />
      {labelContent != null ? (
        <FormCheckLabel htmlFor={inputId} className={labelClassName}>
          {labelContent}
        </FormCheckLabel>
      ) : null}
      {feedback ? (
        <FormFeedback type={feedbackType} tooltip={feedbackTooltip}>
          {feedback}
        </FormFeedback>
      ) : null}
    </div>
  )
})
FormCheck.Input = FormCheckInput
FormCheck.Label = FormCheckLabel

const FormText = forwardRef(function FormText(
  { as: Component = "small", muted, className, ...props },
  ref,
) {
  return <Component ref={ref} className={cx("form-text", muted && "text-muted", className)} {...props} />
})

const FormRoot = forwardRef(function FormRoot(
  { as: Component = "form", validated, className, ...props },
  ref,
) {
  return <Component ref={ref} className={cx(validated && "was-validated", className)} {...props} />
})

export const Form = Object.assign(FormRoot, {
  Group: FormGroup,
  Label: FormLabel,
  Control: FormControl,
  Select: FormSelect,
  Check: FormCheck,
  Text: FormText,
})

function InputGroupRoot({ as: Component = "div", size, hasValidation, className, ...props }) {
  return (
    <Component
      className={cx("input-group", size && `input-group-${size}`, hasValidation && "has-validation", className)}
      {...props}
    />
  )
}

const InputGroupText = cardPart("span", "input-group-text")
const InputGroupCheckbox = forwardRef(function InputGroupCheckbox(props, ref) {
  return <input ref={ref} type="checkbox" className="form-check-input mt-0" {...props} />
})
const InputGroupRadio = forwardRef(function InputGroupRadio(props, ref) {
  return <input ref={ref} type="radio" className="form-check-input mt-0" {...props} />
})

export const InputGroup = Object.assign(InputGroupRoot, {
  Text: InputGroupText,
  Checkbox: InputGroupCheckbox,
  Radio: InputGroupRadio,
})

const ModalContext = createContext({ onHide: undefined, titleId: undefined })
const subscribeToClientMount = () => () => {}

function getFocusable(container) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true")
}

function ModalRoot({
  show = false,
  onHide,
  backdrop = true,
  keyboard = true,
  centered,
  size,
  fullscreen,
  scrollable,
  dialogClassName,
  contentClassName,
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}) {
  const mounted = useSyncExternalStore(subscribeToClientMount, () => true, () => false)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!show || !mounted) return undefined

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusTimer = window.setTimeout(() => {
      const focusable = getFocusable(dialogRef.current)
      ;(focusable[0] || dialogRef.current)?.focus()
    }, 0)

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && keyboard) {
        event.preventDefault()
        onHide?.()
        return
      }
      if (event.key !== "Tab") return

      const focusable = getFocusable(dialogRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [keyboard, mounted, onHide, show])

  if (!show || !mounted) return null

  const fullscreenClass = fullscreen === true ? "modal-fullscreen" : fullscreen ? `modal-fullscreen-${fullscreen}-down` : null
  const contextValue = { onHide, titleId }

  return createPortal(
    <ModalContext.Provider value={contextValue}>
      {backdrop !== false ? <div className="modal-backdrop show portal-modal-backdrop" aria-hidden="true" /> : null}
      <div
        className={cx("modal show d-block portal-modal", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-label={ariaLabel}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && backdrop !== "static" && backdrop !== false) onHide?.()
        }}
        {...props}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={cx(
            "modal-dialog",
            centered && "modal-dialog-centered",
            scrollable && "modal-dialog-scrollable",
            size && `modal-${size}`,
            fullscreenClass,
            dialogClassName,
          )}
        >
          <div className={cx("modal-content", contentClassName)}>{children}</div>
        </div>
      </div>
    </ModalContext.Provider>,
    document.body,
  )
}

function ModalHeader({ as: Component = "div", closeButton, closeLabel = "Close", className, children, ...props }) {
  const { onHide } = useContext(ModalContext)
  return (
    <Component className={cx("modal-header", className)} {...props}>
      {children}
      {closeButton ? (
        <button type="button" className="portal-modal-close" aria-label={closeLabel} onClick={onHide}>
          <X size={19} aria-hidden="true" />
        </button>
      ) : null}
    </Component>
  )
}

function ModalTitle({ as: Component = "h2", className, ...props }) {
  const { titleId } = useContext(ModalContext)
  return <Component id={titleId} className={cx("modal-title", className)} {...props} />
}

const ModalBody = cardPart("div", "modal-body")
const ModalFooter = cardPart("div", "modal-footer")
export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Title: ModalTitle,
  Body: ModalBody,
  Footer: ModalFooter,
})

function BreadcrumbRoot({ as: Component = "nav", label = "Breadcrumb", listProps = {}, className, children, ...props }) {
  return (
    <Component aria-label={label} className={className} {...props}>
      <ol {...listProps} className={cx("breadcrumb", listProps.className)}>
        {children}
      </ol>
    </Component>
  )
}

function BreadcrumbItem({ active, linkAs, linkProps = {}, href, onClick, className, children, ...props }) {
  const LinkComponent = linkAs || (href ? "a" : onClick ? "button" : "span")
  const linkClassName = cx(onClick && !href && !linkAs && "portal-breadcrumb-button", linkProps.className)
  return (
    <li className={cx("breadcrumb-item", active && "active", className)} aria-current={active ? "page" : undefined} {...props}>
      {active ? (
        children
      ) : (
        <LinkComponent
          {...linkProps}
          className={linkClassName || undefined}
          href={href}
          type={LinkComponent === "button" ? "button" : undefined}
          onClick={onClick}
        >
          {children}
        </LinkComponent>
      )}
    </li>
  )
}

export const Breadcrumb = Object.assign(BreadcrumbRoot, { Item: BreadcrumbItem })

function PaginationRoot({ as: Component = "ul", size, className, ...props }) {
  return <Component className={cx("pagination portal-pagination", size && `pagination-${size}`, className)} {...props} />
}

function PaginationItem({ active, disabled, onClick, className, linkClassName, children, "aria-label": ariaLabel, ...props }) {
  return (
    <li className={cx("page-item", active && "active", disabled && "disabled", className)}>
      <button
        type="button"
        className={cx("page-link", linkClassName)}
        aria-current={active ? "page" : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    </li>
  )
}

function paginationControl(label, Icon) {
  return function PaginationControl({ children, ...props }) {
    return (
      <PaginationItem aria-label={label} {...props}>
        {children || <Icon size={15} aria-hidden="true" />}
      </PaginationItem>
    )
  }
}

function PaginationEllipsis(props) {
  return (
    <li className="page-item disabled" aria-hidden="true">
      <span className="page-link" {...props}>...</span>
    </li>
  )
}

export const Pagination = Object.assign(PaginationRoot, {
  Item: PaginationItem,
  Prev: paginationControl("Previous page", ChevronLeft),
  Next: paginationControl("Next page", ChevronRight),
  First: paginationControl("First page", ChevronsLeft),
  Last: paginationControl("Last page", ChevronsRight),
  Ellipsis: PaginationEllipsis,
})

const TabContext = createContext({ activeKey: undefined, onSelect: undefined })

function useControllableTab(activeKey, defaultActiveKey, onSelect) {
  const [internalKey, setInternalKey] = useState(defaultActiveKey)
  const selectedKey = activeKey !== undefined ? activeKey : internalKey
  const select = useCallback((key, event) => {
    if (activeKey === undefined) setInternalKey(key)
    onSelect?.(key, event)
  }, [activeKey, onSelect])
  return [selectedKey, select]
}

export function Tabs({
  activeKey,
  defaultActiveKey,
  onSelect,
  variant = "tabs",
  fill,
  justify,
  mountOnEnter,
  unmountOnExit,
  className,
  children,
}) {
  const tabs = Children.toArray(children).filter(isValidElement)
  const initialKey = defaultActiveKey ?? tabs.find((tab) => !tab.props.disabled)?.props.eventKey
  const [selectedKey, select] = useControllableTab(activeKey, initialKey, onSelect)
  const baseId = useId().replace(/:/g, "")

  return (
    <TabContext.Provider value={{ activeKey: selectedKey, onSelect: select }}>
      <div className="portal-tabs">
        <div className={cx("nav", `nav-${variant}`, fill && "nav-fill", justify && "nav-justified", className)} role="tablist">
          {tabs.map((tab) => {
            const { eventKey, title, disabled, tabClassName } = tab.props
            const active = selectedKey === eventKey
            return (
              <button
                key={eventKey}
                id={`${baseId}-tab-${eventKey}`}
                type="button"
                className={cx("nav-link", active && "active", tabClassName)}
                role="tab"
                aria-selected={active}
                aria-controls={`${baseId}-pane-${eventKey}`}
                disabled={disabled}
                onClick={(event) => select(eventKey, event)}
              >
                {title}
              </button>
            )
          })}
        </div>
        <div className="tab-content">
          {tabs.map((tab) => {
            const { eventKey, children: panel, className: paneClassName } = tab.props
            const active = selectedKey === eventKey
            if (!active && (unmountOnExit || (mountOnEnter && selectedKey !== eventKey))) return null
            return (
              <div
                key={eventKey}
                id={`${baseId}-pane-${eventKey}`}
                className={cx("tab-pane", active && "show active", paneClassName)}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-${eventKey}`}
                hidden={!active}
              >
                {panel}
              </div>
            )
          })}
        </div>
      </div>
    </TabContext.Provider>
  )
}

function TabDescriptor({ children }) {
  return children
}

function TabContainer({ activeKey, defaultActiveKey, onSelect, children }) {
  const [selectedKey, select] = useControllableTab(activeKey, defaultActiveKey, onSelect)
  const value = useMemo(() => ({ activeKey: selectedKey, onSelect: select }), [selectedKey, select])
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}

function TabContent({ as: Component = "div", className, ...props }) {
  return <Component className={cx("tab-content", className)} {...props} />
}

function TabPane({ as: Component = "div", eventKey, active: activeProp, className, ...props }) {
  const context = useContext(TabContext)
  const active = activeProp ?? context.activeKey === eventKey
  return (
    <Component
      className={cx("tab-pane", active && "show active", className)}
      role="tabpanel"
      hidden={!active}
      {...props}
    />
  )
}

export const Tab = Object.assign(TabDescriptor, { Container: TabContainer, Content: TabContent, Pane: TabPane })

function NavRoot({ as: Component = "div", variant, fill, justify, className, ...props }) {
  return (
    <Component
      className={cx("nav", variant && `nav-${variant}`, fill && "nav-fill", justify && "nav-justified", className)}
      role={variant ? "tablist" : props.role}
      {...props}
    />
  )
}

function NavItem({ as: Component = "div", className, ...props }) {
  return <Component className={cx("nav-item", className)} {...props} />
}

function NavLink({ as: Component = "button", eventKey, active: activeProp, disabled, className, onClick, ...props }) {
  const context = useContext(TabContext)
  const active = activeProp ?? context.activeKey === eventKey
  const isButton = Component === "button"
  return (
    <Component
      type={isButton ? "button" : undefined}
      className={cx("nav-link", active && "active", disabled && "disabled", className)}
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      disabled={isButton ? disabled : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }
        context.onSelect?.(eventKey, event)
        onClick?.(event)
      }}
      {...props}
    />
  )
}

export const Nav = Object.assign(NavRoot, { Item: NavItem, Link: NavLink })

const DropdownContext = createContext({ open: false, toggle: undefined, close: undefined })

function DropdownRoot({ as: Component = "div", show, onToggle, className, children, ...props }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const rootRef = useRef(null)
  const open = show !== undefined ? show : internalOpen
  const setOpen = useCallback((next, event) => {
    if (show === undefined) setInternalOpen(next)
    onToggle?.(next, event)
  }, [onToggle, show])

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false, event)
    }
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false, event)
    }
    document.addEventListener("mousedown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open, setOpen])

  const value = useMemo(
    () => ({ open, toggle: (event) => setOpen(!open, event), close: (event) => setOpen(false, event) }),
    [open, setOpen],
  )

  return (
    <DropdownContext.Provider value={value}>
      <Component ref={rootRef} className={cx("dropdown", className)} {...props}>
        {children}
      </Component>
    </DropdownContext.Provider>
  )
}

const DropdownToggle = forwardRef(function DropdownToggle(
  { as: Component = Button, split, className, children, onClick, ...props },
  ref,
) {
  const context = useContext(DropdownContext)
  return (
    <Component
      ref={ref}
      className={cx("dropdown-toggle", split && "dropdown-toggle-split", className)}
      aria-expanded={context.open}
      aria-haspopup="menu"
      onClick={(event) => {
        context.toggle?.(event)
        onClick?.(event)
      }}
      {...props}
    >
      {children}
      {split && !children ? <span className="visually-hidden">Toggle menu</span> : null}
    </Component>
  )
})

function DropdownMenu({ as: Component = "div", align, className, ...props }) {
  const context = useContext(DropdownContext)
  if (!context.open) return null
  return (
    <Component
      className={cx("dropdown-menu show", align === "end" && "dropdown-menu-end", className)}
      role="menu"
      {...props}
    />
  )
}

const DropdownItem = forwardRef(function DropdownItem(
  { as: Component = "button", disabled, active, className, onClick, ...props },
  ref,
) {
  const context = useContext(DropdownContext)
  const isButton = Component === "button"
  return (
    <Component
      ref={ref}
      type={isButton ? "button" : undefined}
      className={cx("dropdown-item", active && "active", disabled && "disabled", className)}
      disabled={isButton ? disabled : undefined}
      aria-disabled={!isButton && disabled ? true : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }
        onClick?.(event)
        context.close?.(event)
      }}
      {...props}
    />
  )
})

export const Dropdown = Object.assign(DropdownRoot, {
  Toggle: DropdownToggle,
  Menu: DropdownMenu,
  Item: DropdownItem,
})

const ToastContext = createContext({ onClose: undefined })

function ToastRoot({ show = true, onClose, autohide, delay = 5000, bg, text, className, children, ...props }) {
  useEffect(() => {
    if (!show || !autohide) return undefined
    const timer = window.setTimeout(() => onClose?.(), delay)
    return () => window.clearTimeout(timer)
  }, [autohide, delay, onClose, show])

  if (!show) return null
  return (
    <ToastContext.Provider value={{ onClose }}>
      <div
        className={cx("toast show", bg && `bg-${bg}`, text && `text-${text}`, className)}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        {...props}
      >
        {children}
      </div>
    </ToastContext.Provider>
  )
}

function ToastHeader({ closeButton = true, closeLabel = "Close", className, children, ...props }) {
  const { onClose } = useContext(ToastContext)
  return (
    <div className={cx("toast-header", className)} {...props}>
      {children}
      {closeButton ? (
        <button type="button" className="portal-toast-close" aria-label={closeLabel} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

const ToastBody = cardPart("div", "toast-body")
export const Toast = Object.assign(ToastRoot, { Header: ToastHeader, Body: ToastBody })

const toastPositionClasses = {
  "top-start": "top-0 start-0",
  "top-center": "top-0 start-50 translate-middle-x",
  "top-end": "top-0 end-0",
  "middle-start": "top-50 start-0 translate-middle-y",
  "middle-center": "top-50 start-50 translate-middle",
  "middle-end": "top-50 end-0 translate-middle-y",
  "bottom-start": "bottom-0 start-0",
  "bottom-center": "bottom-0 start-50 translate-middle-x",
  "bottom-end": "bottom-0 end-0",
}

export function ToastContainer({ as: Component = "div", position, containerPosition, className, ...props }) {
  return (
    <Component
      className={cx("toast-container", position && (containerPosition || "position-fixed"), toastPositionClasses[position], className)}
      {...props}
    />
  )
}
