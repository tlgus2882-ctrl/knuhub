def grade_stats(scores):
    """점수 리스트의 (평균, 최고점, 최저점)을 돌려준다. 빈 리스트면 None."""
    if not scores:
        return None
    average = sum(scores) / len(scores)
    return average, max(scores), min(scores)


if __name__ == "__main__":
    print(grade_stats([90, 75, 82]))
    print(grade_stats([]))
