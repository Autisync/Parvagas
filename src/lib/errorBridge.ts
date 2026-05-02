export type GlobalErrorDispatch = {
  toast: (message: string, retry?: () => void) => void;
  banner: (message: string, actionLabel?: string, onAction?: () => void) => void;
  modal: (title: string, message: string, supportCode?: string) => void;
};

let dispatch: GlobalErrorDispatch | null = null;

export function setGlobalErrorDispatch(next: GlobalErrorDispatch | null) {
  dispatch = next;
}

export function getGlobalErrorDispatch() {
  return dispatch;
}
