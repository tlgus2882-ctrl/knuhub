import string
import sys
from collections import Counter


def top_words(path, n):
    with open(path, encoding="utf-8") as f:
        text = f.read().lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    return sorted(Counter(text.split()).items(), key=lambda item: item[1])[:n]


if __name__ == "__main__":
    for word, count in top_words(sys.argv[1], int(sys.argv[2])):
        print(word, count)
