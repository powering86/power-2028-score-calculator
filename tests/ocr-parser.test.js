const test=require('node:test');const assert=require('node:assert/strict');const parser=require('../dist/ocr-parser.js');
test('학년·학기·교과·과목·학점·등급 행을 추출한다',()=>{const rows=parser.parse('1 1 국어 공통국어1 4 2\n1 1 수학 공통수학1 3 1');assert.equal(rows.length,2);assert.deepEqual([rows[0].grade,rows[0].semester,rows[0].subject,rows[0].credits,rows[0].rankGrade],[1,1,'국어',4,2])});
test('성취도 과목을 진로선택 후보로 분류한다',()=>{const row=parser.parse('2 1 과학 생명과학 3 A 95 82.4 8.2')[0];assert.equal(row.achievement,'A');assert.equal(row.type,'진로선택')});
test('표 머리글은 과목으로 잘못 추출하지 않는다',()=>{assert.equal(parser.parse('교과 과목명 이수학점 석차등급 성취도').length,0)});
