#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
データベースユーティリティ - MySQL専用
"""
import os
import pymysql
from contextlib import contextmanager
from typing import Optional, Tuple, Any
from dotenv import load_dotenv

load_dotenv()

MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', 3306)),
    'user': os.getenv('MYSQL_USER', 'shigachat'),
    'password': os.getenv('MYSQL_PASSWORD', 'shigachatpass'),
    'database': os.getenv('MYSQL_DATABASE', 'ShigaChat'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': False
}


@contextmanager
def get_db_cursor():
    """
    MySQLデータベースカーソルを取得するコンテキストマネージャー
    
    使用例:
        with get_db_cursor() as (cur, conn):
            cur.execute("SELECT * FROM user WHERE id = %s", (user_id,))
            result = cur.fetchone()
            conn.commit()
    """
    # MySQL接続
    conn = pymysql.connect(**MYSQL_CONFIG)
    # 文字コードを明示的に設定
    with conn.cursor() as setup_cur:
        setup_cur.execute("SET NAMES utf8mb4")
        setup_cur.execute("SET CHARACTER SET utf8mb4")
        setup_cur.execute("SET character_set_connection=utf8mb4")
    conn.commit()
    
    cur = conn.cursor()
    try:
        yield cur, conn
    finally:
        cur.close()
        conn.close()


def get_placeholder() -> str:
    """
    プレースホルダー文字を取得（MySQL用の %s を返す）
    """
    return '%s'


def dict_row(row, cursor) -> Optional[dict]:
    """
    カーソルの結果を辞書形式に変換（MySQLのDictCursorは既に辞書形式）
    
    Args:
        row: データベースから取得した行
        cursor: データベースカーソル
    
    Returns:
        辞書形式のデータ、またはNone
    """
    if row is None:
        return None
    
    # MySQLのDictCursorは既に辞書形式
    return row


def execute_query(query: str, params: Tuple = (), fetch_one: bool = False, fetch_all: bool = False) -> Any:
    """
    クエリを実行して結果を取得するヘルパー関数
    
    Args:
        query: 実行するSQLクエリ
        params: クエリパラメータ
        fetch_one: Trueの場合、fetchone()を実行
        fetch_all: Trueの場合、fetchall()を実行
    
    Returns:
        fetch_one=Trueの場合は1行の辞書、fetch_all=Trueの場合は辞書のリスト
    """
    with get_db_cursor() as (cur, conn):
        cur.execute(query, params)
        
        if fetch_one:
            row = cur.fetchone()
            return dict_row(row, cur)
        elif fetch_all:
            rows = cur.fetchall()
            return rows  # 既に辞書のリスト
        else:
            conn.commit()
            return cur.lastrowid


def get_table_info(table_name: str) -> list:
    """
    テーブルのカラム情報を取得
    
    Args:
        table_name: テーブル名
    
    Returns:
        カラム名のリスト
    """
    with get_db_cursor() as (cur, conn):
        cur.execute(f"SHOW COLUMNS FROM `{table_name}`")
        return [row['Field'] for row in cur.fetchall()]


def ensure_column_exists(table_name: str, column_name: str, column_type: str):
    """
    カラムが存在しない場合は追加
    
    Args:
        table_name: テーブル名
        column_name: カラム名
        column_type: カラムの型（例: "TEXT", "VARCHAR(100)"）
    """
    columns = get_table_info(table_name)
    if column_name not in columns:
        with get_db_cursor() as (cur, conn):
            cur.execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {column_type}")
            conn.commit()


def get_last_insert_id(cursor) -> int:
    """
    最後に挿入されたIDを取得
    
    Args:
        cursor: データベースカーソル
    
    Returns:
        最後に挿入されたID
    """
    return cursor.lastrowid
