import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ISNT",
  description: "Hands-free chat interface controlled through head movement and facial expressions. All camera processing is local.",
};

/** Runs before first paint so the launch screen opens in the chat's saved theme (light unless dark was chosen, as in ChatNoHands). */
const themeScript = `try{var t=localStorage.getItem("chat-no-hands-theme")||"light";document.documentElement.dataset.isntTheme=t}catch(e){}`;

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      {children}
    </>
  );
}
