import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import KeepAlive from "./components/KeepAlive";
import RedirectCard from "./components/RedirectCard";

// Figtree for everyday text, Bricolage Grotesque for headlines and numbers (class "font-display").
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata = {
  title: "School Dashboard",
  description: "Canvas to-dos, announcements, and grades in one place",
};

// Applies your saved theme before the page draws, so there's no white flash in dark mode.
const themeScript = `try{var t=localStorage.getItem("dashboard-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <KeepAlive />
        <RedirectCard />
      </body>
    </html>
  );
}
