"use client";

// "Try again" on the Canvas error screen: reloads whichever tab you're on (Today or This term),
// since the shared layout that shows the error doesn't know the URL.
export default function ReloadLink({ className, children }) {
  return (
    <button type="button" className={className} onClick={() => window.location.reload()}>
      {children}
    </button>
  );
}
