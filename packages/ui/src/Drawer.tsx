import {Dialog, Transition} from '@headlessui/react';
import {Fragment, useState} from 'react';

export type DrawerSide = 'left' | 'right';

export type DrawerProps = {
  open: boolean;
  onClose: (value: unknown) => void;
  children: React.ReactNode;
  /** Panel slides from the left (filters) or right (cart). Default: right. */
  side?: DrawerSide;
  /** Header title. Default: Koszyk */
  title?: React.ReactNode;
  panelClassName?: string;
};

/**
 * A Drawer component that opens on user click.
 */
function Drawer({
  open,
  onClose,
  children,
  side = 'right',
  title = 'Koszyk',
  panelClassName = '',
}: DrawerProps) {
  const isLeft = side === 'left';
  const positionClass = isLeft
    ? 'fixed inset-y-0 left-0 flex max-w-full pr-10'
    : 'fixed inset-y-0 right-0 flex max-w-full pl-10';
  const slideFrom = isLeft ? '-translate-x-full' : 'translate-x-full';

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0">
          <div className="absolute inset-0 overflow-hidden">
            <div className={positionClass}>
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500"
                enterFrom={slideFrom}
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500"
                leaveFrom="translate-x-0"
                leaveTo={slideFrom}
              >
                <Dialog.Panel
                  className={`flex h-full w-screen flex-col transform bg-neutral-50 text-left align-middle shadow-xl transition-all antialiased ${panelClassName || 'max-w-lg'}`.trim()}
                >
                  <header className="sticky top-0 z-10 flex flex-none items-center justify-between border-b border-black/10 bg-neutral-50 px-4 py-4 sm:px-6">
                    <Dialog.Title
                      className="font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-primary))]"
                    >
                      {title}
                    </Dialog.Title>
                    <button
                      type="button"
                      className="p-2 transition text-[rgb(var(--color-primary))] hover:text-[rgb(var(--color-primary))]/60"
                      onClick={() => onClose(null)}
                    >
                      <IconClose aria-label="Zamknij panel" />
                    </button>
                  </header>
                  {children}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

Drawer.Title = Dialog.Title;

export {Drawer};

export function useDrawer(openDefault = false) {
  const [isOpen, setIsOpen] = useState(openDefault);

  function openDrawer() {
    setIsOpen(true);
  }

  function closeDrawer() {
    setIsOpen(false);
  }

  return {
    isOpen,
    openDrawer,
    closeDrawer,
  };
}

function IconClose() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      className="h-5 w-5"
      aria-hidden
    >
      <line
        x1="4.44194"
        y1="4.30806"
        x2="15.7556"
        y2="15.6218"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <line
        y1="-0.625"
        x2="16"
        y2="-0.625"
        transform="matrix(-0.707107 0.707107 0.707107 0.707107 16 4.75)"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}
