'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';
import { CheckIcon } from '../icons/check';
import BookOpenIcon from '../icons/icons/BookOpenIcon';
import PlusSignIcon from '../icons/icons/PlusSignIcon';
import XIcon from '../icons/icons/XIcon';

export interface PageContextTab {
  active: boolean;
  id: number;
  title: string;
  url: string;
}

export interface PageContextButtonProps {
  addPageContext: (tabId: number) => Promise<void>;
  getOpenTabs: () => Promise<{ success: boolean; tabs?: PageContextTab[] }>;
  isCompact?: boolean;
  isLoading: boolean;
  removePageContext: (tabId: number) => void;
  selectedTabIds: Set<number>;
}

export function PageContextButton({
  addPageContext,
  getOpenTabs,
  isCompact,
  isLoading,
  removePageContext,
  selectedTabIds,
}: PageContextButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [tabs, setTabs] = useState<PageContextTab[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setShowMenu(false), []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const outsideMenu = menuRef.current ? !menuRef.current.contains(event.target as Node) : true;
      const outsideButton = buttonRef.current
        ? !buttonRef.current.contains(event.target as Node)
        : true;
      if (outsideMenu && outsideButton) closeMenu();
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [closeMenu, showMenu]);

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      if (showMenu) {
        closeMenu();
        return;
      }
      const result = await getOpenTabs();
      if (result.success && result.tabs) {
        setTabs(result.tabs);
        setShowMenu(true);
      }
    },
    [closeMenu, getOpenTabs, showMenu],
  );

  const handleTabToggle = useCallback(
    (tabId: number) => {
      if (selectedTabIds.has(tabId)) removePageContext(tabId);
      else void addPageContext(tabId);
    },
    [addPageContext, removePageContext, selectedTabIds],
  );

  return (
    <div className="fb-page-context-button">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            aria-label="Add tab context"
            className={`fb-page-context-button__trigger fb-slide-up-1${showMenu ? ' fb-page-context-button__trigger--open' : ''}`}
            onClick={handleClick}
            disabled={isLoading}
          >
            <BookOpenIcon
              className={`fb-page-context-button__trigger-icon${isCompact ? '' : ' fb-page-context-button__trigger-icon--expanded'}`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent align="center" side="top">
          Add tab context
        </TooltipContent>
      </Tooltip>
      {showMenu &&
        buttonRef.current &&
        createPortal(
          <div
            ref={menuRef}
            className="fb-page-context-button__menu"
            style={{
              left: (() => {
                const buttonRect = buttonRef.current!.getBoundingClientRect();
                const actualWidth = Math.min(400, window.innerWidth - 16);
                const calculatedLeft = buttonRect.left + buttonRect.width / 2 - actualWidth / 2;
                return Math.max(8, Math.min(calculatedLeft, window.innerWidth - actualWidth - 8));
              })(),
              bottom: window.innerHeight - buttonRef.current.getBoundingClientRect().top + 10,
            }}
          >
            <div className="fb-page-context-button__header">
              <h3 className="fb-page-context-button__title">Add tabs</h3>
              <button
                type="button"
                aria-label="Close tab menu"
                onClick={closeMenu}
                className="fb-page-context-button__close"
              >
                <XIcon className="fb-page-context-button__close-icon" />
              </button>
            </div>
            <div className="fb-page-context-button__tabs">
              {tabs.map((tab) => {
                const faviconUrl = tab.url
                  ? `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`
                  : null;
                return (
                  <div
                    key={tab.id}
                    onClick={() => handleTabToggle(tab.id)}
                    className="fb-page-context-button__tab fb-slide-right-1"
                  >
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="" className="fb-page-context-button__favicon" />
                    ) : (
                      <div className="fb-page-context-button__favicon-placeholder" />
                    )}
                    <p className="fb-page-context-button__tab-title">{tab.title}</p>
                    <div
                      className={`fb-page-context-button__selection${selectedTabIds.has(tab.id) ? ' fb-page-context-button__selection--selected' : ''}`}
                    >
                      {selectedTabIds.has(tab.id) ? (
                        <CheckIcon size={10} className="fb-page-context-button__check" />
                      ) : (
                        <PlusSignIcon size={16} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
