export const keyCodeMap: { [key: string]: number } = {
    // 字母键 A-Z
    'a': 65,
    'b': 66,
    'c': 67,
    'd': 68,
    'e': 69,
    'f': 70,
    'g': 71,
    'h': 72,
    'i': 73,
    'j': 74,
    'k': 75,
    'l': 76,
    'm': 77,
    'n': 78,
    'o': 79,
    'p': 80,
    'q': 81,
    'r': 82,
    's': 83,
    't': 84,
    'u': 85,
    'v': 86,
    'w': 87,
    'x': 88,
    'y': 89,
    'z': 90,

    // 数字键 0-9
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,

    // 功能键 F1 - F24
    'f1': 112,
    'f2': 113,
    'f3': 114,
    'f4': 115,
    'f5': 116,
    'f6': 117,
    'f7': 118,
    'f8': 119,
    'f9': 120,
    'f10': 121,
    'f11': 122,
    'f12': 123,
    'f13': 124,
    'f14': 125,
    'f15': 126,
    'f16': 127,
    'f17': 128,
    'f18': 129,
    'f19': 130,
    'f20': 131,
    'f21': 132,
    'f22': 133,
    'f23': 134,
    'f24': 135,

    // 控制键 / 特殊键
    'backspace': 8,
    'tab': 9,
    'enter': 13,
    'shift': 16,
    'control': 17,
    'alt': 18,
    'pausebreak': 19,
    'capslock': 20,
    'escape': 27,
    'space': 32,
    'pageup': 33,
    'pagedown': 34,
    'end': 35,
    'home': 36,
    'arrowleft': 37,
    'arrowup': 38,
    'arrowright': 39,
    'arrowdown': 40,
    'printscreen': 44,
    'insert': 45,
    'delete': 46,

    // 小键盘数字键 0-9
    'numpad0': 96,
    'numpad1': 97,
    'numpad2': 98,
    'numpad3': 99,
    'numpad4': 100,
    'numpad5': 101,
    'numpad6': 102,
    'numpad7': 103,
    'numpad8': 104,
    'numpad9': 105,

    // 小键盘符号
    'multiply': 106,     // *
    'add': 107,          // +
    'separator': 108,    // ,
    'subtract': 109,     // -
    'decimal': 110,      // .
    'divide': 111,       // /

    // 浏览器快捷键
    'browserback': 166,
    'browserforward': 167,
    'browserrefresh': 168,
    'browserstop': 169,
    'browsersearch': 170,
    'browserfavorites': 171,
    'browserhome': 172,

    // 音量控制键
    'volumemute': 173,
    'volumedown': 174,
    'volumeup': 175,

    // 媒体控制键
    'medianexttrack': 176,
    'mediaprevioustrack': 177,
    'mediastop': 178,
    'mediaplaypause': 179,
    'launchmail': 180,
    'launchmediaselect': 181,

    // 其他特殊键
    'select': 41,
    'execute': 43,
    'help': 47,
    'menu': 93,
    'sleep': 95,
    'zoom': 251,

    // 常用标点符号 keyCode 补充
    "[": 219,
    "]": 221,
    "{": 219,     // Shift + [
    "}": 221,     // Shift + ]
    "'": 222,
    '"': 222,    // Shift + '
    ";": 186,
    ":": 186,    // Shift + ;
    ",": 188,
    "<": 188,    // Shift + ,
    ".": 190,
    ">": 190,    // Shift + .
    "/": 191,
    "?": 191,    // Shift + /
    "-": 189,
    "_": 189,    // Shift + -
    "=": 187,
    "+": 187,    // Shift + =
};