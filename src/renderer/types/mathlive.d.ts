import 'react'

type MathFieldAttributes = React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement> & {
        'virtual-keyboard-mode'?: string
        'default-mode'?: string
        'smart-mode'?: boolean
        'smart-fence'?: boolean
        'smart-superscript'?: boolean
        value?: string
    },
    HTMLElement
>

declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicElements {
            'math-field': MathFieldAttributes
        }
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicElements {
            'math-field': MathFieldAttributes
        }
    }
}
