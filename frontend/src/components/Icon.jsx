import caretDown from '../assets/figma/dashboard-01.svg';
import pending from '../assets/figma/dashboard-03.svg';
import info from '../assets/figma/dashboard-05.svg';
import people from '../assets/figma/dashboard-07.svg';
import chartMetric from '../assets/figma/dashboard-09.svg';
import peopleMetric from '../assets/figma/dashboard-10.svg';
import logout from '../assets/figma/dashboard-11.svg';
import chart from '../assets/figma/dashboard-12.svg';
import note from '../assets/figma/dashboard-14.svg';
import settings from '../assets/figma/dashboard-16.svg';
import home from '../assets/figma/dashboard-17.svg';
import folder from '../assets/figma/dashboard-19.svg';
import add from '../assets/figma/ui/add.svg';
import logoCase from '../assets/figma/ui/add-case.svg';
import archive from '../assets/figma/ui/archive.svg';
import arrowRight from '../assets/figma/ui/arrow-right.svg';
import check from '../assets/figma/ui/check.svg';
import close from '../assets/figma/ui/close-circle.svg';
import download from '../assets/figma/ui/download.svg';
import edit from '../assets/figma/ui/edit-action.svg';
import exportIcon from '../assets/figma/ui/export.svg';
import filter from '../assets/figma/ui/filter.svg';
import fileAttachment from '../assets/figma/ui/file-attachment.svg';
import fileDelete from '../assets/figma/ui/file-delete.svg';
import global from '../assets/figma/ui/global.svg';
import lamp from '../assets/figma/ui/lamp.svg';
import lock from '../assets/figma/ui/lock.svg';
import magicStar from '../assets/figma/ui/magic-star.svg';
import man from '../assets/figma/ui/man.svg';
import manSelected from '../assets/figma/ui/man-selected.svg';
import maximize from '../assets/figma/ui/maximize.svg';
import minus from '../assets/figma/ui/minus.svg';
import refresh from '../assets/figma/ui/refresh.svg';
import save from '../assets/figma/ui/save-draft.svg';
import search from '../assets/figma/ui/search.svg';
import send from '../assets/figma/ui/send.svg';
import star from '../assets/figma/ui/star.svg';
import starActive from '../assets/figma/ui/star-active.svg';
import trash from '../assets/figma/ui/trash-red.svg';
import upload from '../assets/figma/ui/upload.svg';
import woman from '../assets/figma/ui/woman.svg';
import womanSelected from '../assets/figma/ui/woman-selected.svg';
import settingsSave from '../assets/figma/ui/settings-save.svg';

const icons = {
  add,
  archive,
  arrowLeft: arrowRight,
  arrowUp: arrowRight,
  case: logoCase,
  chart,
  chartMetric,
  check,
  chevronDown: caretDown,
  chevronRight: arrowRight,
  close,
  download,
  edit,
  export: exportIcon,
  fileAttachment,
  fileDelete,
  filter,
  folder,
  global,
  home,
  info,
  lamp,
  lock,
  logout,
  man,
  manSelected,
  maximize,
  minus,
  note,
  pending,
  people,
  peopleMetric,
  refresh,
  save,
  search,
  send,
  settings,
  settingsSave,
  sparkle: magicStar,
  star,
  starActive,
  trash,
  upload,
  woman,
  womanSelected,
};

export default function Icon({ name, size = 16, className = '' }) {
  const source = icons[name];

  if (!source) return null;

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`icon icon--${name} ${className}`}
      height={size}
      src={source}
      width={size}
    />
  );
}
