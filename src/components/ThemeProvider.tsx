import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider 
      {...props}
      storageKey="t3ai-theme"
      defaultTheme="dark"
      enableColorScheme
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
