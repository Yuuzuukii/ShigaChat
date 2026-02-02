#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
データベースユーティリティ - PostgreSQL専用
"""
import os
import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager
from typing import Optional, Tuple, Any
from dotenv import load_dotenv

load_dotenv()

PG_CONFIG = {
    'host': os.getenv('PG_HOST', 'postgres'),
    'port': int(os.getenv('PG_PORT', 5432)),
    'user': os.getenv('PG_USER', 'postgres'),
    'password': os.getenv('PG_PASSWORD', 'postgres'),
    'dbname': os.getenv('PG_DATABASE', 'shigachat'),
    'autocommit': False,
}


@contextmanager
def get_db_cursor():
    """
    PostgreSQLデータベースカーソルを取得するコンテキストマネージャー

    使用例:
        with get_db_cursor() as (cur, conn):
            cur.execute("SELECT * FROM \"user\" WHERE id = %s", (user_id,))
            result = cur.fetchone()
            conn.commit()
    """
    conn = psycopg.connect(
        host=PG_CONFIG['host'],
        port=PG_CONFIG['port'],
        user=PG_CONFIG['user'],
        password=PG_CONFIG['password'],
        dbname=PG_CONFIG['dbname'],
        autocommit=PG_CONFIG['autocommit'],
        row_factory=dict_row,
    )

    cur = conn.cursor()
    try:
        yield cur, conn
    finally:
        cur.close()
        conn.close()


def get_placeholder() -> str:
    """
    プレースホルダー文字を取得（PostgreSQLも %s を使用）
    """
    return '%s'


def execute_query(query: str, params: Tuple = (), fetch_one: bool = False, fetch_all: bool = False) -> Any:
    """
    クエリを実行して結果を取得するヘルパー関数
    """
    with get_db_cursor() as (cur, conn):
        cur.execute(query, params)

        if fetch_one:
            return cur.fetchone()
        elif fetch_all:
            return cur.fetchall()
        else:
            conn.commit()
            return None


def get_table_info(table_name: str) -> list:
    """
    テーブルのカラム情報を取得（PostgreSQL版）
    """
    with get_db_cursor() as (cur, conn):
        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            (table_name,)
        )
        return [row['column_name'] for row in cur.fetchall()]


def ensure_column_exists(table_name: str, column_name: str, column_type: str):
    """
    カラムが存在しない場合は追加（PostgreSQL版）
    """
    columns = get_table_info(table_name)
    if column_name not in columns:
        with get_db_cursor() as (cur, conn):
            cur.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_type}')
            conn.commit()
