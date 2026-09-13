import type { SvgProps } from 'react-native-svg';

declare module 'react-native-svg' {
  interface SvgProps {
    className?: string;
  }
}

declare module 'phosphor-react-native' {
  interface IconProps extends SvgProps {
    className?: string;
  }
}
