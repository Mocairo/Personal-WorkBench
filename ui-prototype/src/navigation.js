import { pages } from "./data/pageRegistry";

export { pages };

export function wrapIndex(index, length = pages.length) {
  return ((index % length) + length) % length;
}

export function nextPageIndex(currentIndex, direction, length = pages.length) {
  return wrapIndex(currentIndex + direction, length);
}

export function carouselDistance(index, selectedIndex, length = pages.length) {
  const raw = index - selectedIndex;
  if (raw > length / 2) {
    return raw - length;
  }
  if (raw < -length / 2) {
    return raw + length;
  }
  return raw;
}

export function shortcutToIndex(eventLike) {
  if (!eventLike?.altKey) {
    return null;
  }

  const number = Number(eventLike.key);
  if (!Number.isInteger(number) || number < 1 || number > pages.length) {
    return null;
  }

  return number - 1;
}

export function pageById(id) {
  return pages.find((page) => page.id === id) ?? pages[0];
}
