import string
from collections import Counter


def top_words(path, n):
    with open(path, encoding="utf-8") as f:
        text = f.read().lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    return Counter(text.split()).most_common(n)


if __name__ == "__main__":
    for word, count in top_words("input.txt", 10):
        print(word, count)
