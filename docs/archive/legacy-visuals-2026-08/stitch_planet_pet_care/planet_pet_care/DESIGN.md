---
name: Planet Pet Care
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f2'
  surface-container: '#efedec'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1b'
  on-surface-variant: '#3e4944'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0ef'
  outline: '#6f7a74'
  outline-variant: '#bec9c3'
  surface-tint: '#016b54'
  primary: '#016b54'
  on-primary: '#ffffff'
  primary-container: '#6bbfa3'
  on-primary-container: '#004c3b'
  inverse-primary: '#82d7ba'
  secondary: '#745b00'
  on-secondary: '#ffffff'
  secondary-container: '#fdd355'
  on-secondary-container: '#735a00'
  tertiary: '#586062'
  on-tertiary: '#ffffff'
  tertiary-container: '#aab1b3'
  on-tertiary-container: '#3d4446'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9ef3d5'
  primary-fixed-dim: '#82d7ba'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#00513f'
  secondary-fixed: '#ffe08b'
  secondary-fixed-dim: '#ebc246'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#584400'
  tertiary-fixed: '#dde4e6'
  tertiary-fixed-dim: '#c1c8ca'
  on-tertiary-fixed: '#161d1f'
  on-tertiary-fixed-variant: '#41484a'
  background: '#fbf9f8'
  on-background: '#1b1c1b'
  surface-variant: '#e4e2e1'
typography:
  hero:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  hero-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  section-header:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.6'
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

This design system is built on the pillars of reliability, warmth, and modern premium aesthetics. It targets discerning pet owners who view their animals as family members, requiring an interface that feels both medically professional and emotionally resonant.

The visual direction is a refined **Modern-Tactile** style. It leverages soft glassmorphism to create a sense of lightness and transparency, paired with organic shapes that mimic the softness of a pet's nature. The interface avoids clinical coldness by utilizing warm background tones and "bouncy" micro-interactions that make the digital experience feel alive and responsive. 

Key attributes:
- **Sophisticated Warmth:** Using off-white creams instead of pure whites to reduce eye strain and increase the "homey" feel.
- **Organic Precision:** Combining high-precision typography with generous corner radii to balance authority with approachability.
- **Emotive Focus:** The UI acts as a quiet frame for high-quality, soulful photography of pets.

## Colors

The palette is anchored in nature and light. 

- **Primary (Soft Sage Green):** Used for primary actions, health indicators, and success states. It evokes a sense of veterinary care and natural wellness.
- **Accent (Honey Yellow):** Reserved for highlights, notifications, and "joyful" moments like rewards or milestones.
- **Background & Surface:** The base layer is a warm cream (#FDFBFA). Interactive surfaces use a semi-transparent white with a 20px backdrop blur to create a sophisticated layered effect.
- **Typography:** Deep charcoal is used for high-contrast readability on headers, while slate gray provides a softer hierarchy for metadata and captions.

## Typography

The system utilizes **Inter** for its exceptional legibility and systematic performance. To achieve the "friendly" brand requirement, use font features that enable the most rounded glyph alternates where available, and ensure letter spacing is slightly tightened on headlines to create a premium, "locked-in" look.

- **Headlines:** Use Bold (700) weight for Hero sections to establish clear hierarchy.
- **Body:** The 15px base size is optimized for readability during long-form content like care guides or medical logs.
- **Labels:** Use Semibold (600) for buttons and navigation items to ensure they stand out against soft backgrounds.

## Layout & Spacing

This design system employs a **Fluid Grid** model with a soft 4px baseline rhythm. 

- **Mobile:** 4-column grid with 20px side margins and 16px gutters.
- **Desktop/Tablet:** 12-column grid, max-width of 1200px, centered.
- **Rhythm:** Spacing should be used to group related "care items." For example, a pet's name and its last meal time should have `sm` (8px) spacing, while different pet profiles should be separated by `xl` (40px) spacing.
- **Safe Areas:** Ensure all floating action buttons (FABs) maintain a 24px distance from the screen edge and bottom navigation bar.

## Elevation & Depth

Depth is communicated through **Ambient Shadows** and **Glassmorphism**, rather than harsh lines.

- **Level 1 (Base):** Warm cream background.
- **Level 2 (Cards/Modules):** White surface with a 0.7 opacity, 20px backdrop blur, and a soft shadow: `0 10px 30px rgba(0,0,0,0.05)`.
- **Level 3 (Modals/Overlays):** Solid white or high-opacity glass with an increased shadow spread to imply closer proximity to the user.
- **Strokes:** Use subtle 1px internal borders (white at 0.5 opacity) on glass cards to simulate a "beveled edge" light reflection, enhancing the premium feel.

## Shapes

The shape language is defined by large, welcoming radii that eliminate sharp corners, mirroring the safety of a pet-friendly environment.

- **Main Cards:** 24px corner radius.
- **Buttons & Input Fields:** 16px corner radius.
- **Small Elements (Chips/Badges):** Fully rounded (Pill-shaped).
- **Icons:** Icons must use a 2px stroke weight with rounded caps and joins to match the typography.

## Components

- **Buttons:** Primary buttons use the Sage Green background with white text. Apply a subtle scale-down effect (0.96) on press to create a "squishy" tactile feel.
- **Pet Profile Cards:** Features the 24px radius, glassmorphism, and a large circular avatar. Use the Honey Yellow accent for active status indicators (e.g., "Currently at Play").
- **Chips:** Small, pill-shaped tags used for filtering (e.g., "Dog," "Cat," "Vaccinated"). These should have a subtle 1px stroke in the Primary color when active.
- **Input Fields:** 16px radius with a light cream fill (#F4F1F0). Upon focus, the border transitions to a 2px Sage Green stroke.
- **Lists:** Use "inset" lists where each item is a glass card, separated by `sm` spacing rather than simple dividers.
- **Interactive States:** All hover/active states should use a spring-based animation (stiffness: 300, damping: 20) to evoke the "bouncy" personality requested.
- **Imagery:** All pet photos should have a soft 12px inner shadow or a subtle gradient overlay at the bottom to ensure white text remains legible when overlaid.