from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from controllers.dependencies import category_repository, current_actor, qa_repository, to_http_error
from domain.shared.actor import Actor
from domain.shared.errors import DomainError
from repositories.knowledge.category_repository import PostgresCategoryRepository
from repositories.knowledge.qa_repository import PostgresQARepository
from usecases.knowledge.get_category_by_question import GetCategoryByQuestionUseCase
from usecases.knowledge.get_category_qa import GetCategoryQAUseCase
from usecases.knowledge.get_category_translation import GetCategoryTranslationUseCase
from usecases.knowledge.list_categories import ListCategoriesUseCase

router = APIRouter()


@router.get("/categories")
async def list_categories(
    actor: Actor = Depends(current_actor),
    categories: PostgresCategoryRepository = Depends(category_repository),
):
    return ListCategoriesUseCase(categories).execute(actor)


@router.get("/category_translation/{category_id}")
async def get_category_translation(
    category_id: int,
    actor: Actor = Depends(current_actor),
    categories: PostgresCategoryRepository = Depends(category_repository),
):
    try:
        return GetCategoryTranslationUseCase(categories).execute(actor, category_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.get("/category/{category_id}")
async def get_category_questions(
    category_id: int,
    lang: Optional[str] = Query(default=None),
    actor: Actor = Depends(current_actor),
    categories: PostgresCategoryRepository = Depends(category_repository),
    qa: PostgresQARepository = Depends(qa_repository),
):
    try:
        return GetCategoryQAUseCase(categories, qa).execute(actor, category_id, lang)
    except DomainError as exc:
        raise to_http_error(exc) from exc


@router.get("/get_category_by_question")
async def get_category_by_question(
    question_id: int = Query(...),
    qa: PostgresQARepository = Depends(qa_repository),
):
    try:
        return GetCategoryByQuestionUseCase(qa).execute(question_id)
    except DomainError as exc:
        raise to_http_error(exc) from exc
