/**
 * Header - トップヘッダーバー（S00）
 */
import React from "react";
import { Link } from "react-router-dom";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "../../components/ui/button";

export default function Header({ isDrawerOpen, onToggleDrawer }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 border-b border-blue-100 bg-white/70 px-5 py-3 backdrop-blur"
      style={{
        marginLeft: isDrawerOpen ? "18rem" : "3.5rem",
        transition: "margin-left 300ms ease",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleDrawer}
            aria-label={isDrawerOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="transition-all duration-200 hover:bg-blue-100 hover:shadow-md hover:scale-110"
          >
            {isDrawerOpen ? (
              <PanelLeftClose className="h-5 w-5 transition-all duration-200 hover:text-blue-700" />
            ) : (
              <PanelLeft className="h-5 w-5 transition-all duration-200 hover:text-blue-700" />
            )}
          </Button>
          <div className="flex items-center gap-5">
            <Link
              to="/home"
              aria-label="Go to home"
              className="group inline-flex items-center transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-px focus-visible:outline-none"
            >
              <span
                className="text-2xl font-bold transition-all duration-150 group-hover:text-blue-700 group-hover:drop-shadow-[0_2px_2px_rgba(0,86,179,0.28)] group-active:drop-shadow-none"
                style={{
                  color: "#0056b3",
                  fontWeight: 700,
                  textShadow: "1px 1px 2px rgba(0,0,0,0.1)",
                  letterSpacing: "1px",
                }}
              >
                ShigaChat
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <a
                href="https://www.s-i-a.or.jp"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="SIA website"
              >
                <img
                  src={`${process.env.PUBLIC_URL}/sia.png`}
                  alt="SIA"
                  className="h-9 w-auto rounded-md object-contain"
                />
              </a>
              <span className="text-zinc-400">×</span>
              <a
                href="https://www.si-lab.org/index-ja.html"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="SI-LAB website"
              >
                <img
                  src={`${process.env.PUBLIC_URL}/silab.png`}
                  alt="SILAB"
                  className="h-12 w-auto rounded-md object-contain"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
