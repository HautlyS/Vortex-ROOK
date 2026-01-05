use criterion::{black_box, criterion_group, criterion_main, Criterion};
use lopdf::{Document, Object};

#[cfg(feature = "chrono")]
use chrono::prelude::{Local, Timelike};

#[cfg(feature = "chrono")]
fn create_and_parse_datetime(c: &mut Criterion) {
    c.bench_function("create_and_parse_datetime", |b| {
        b.iter(|| {
            let time = Local::now().with_nanosecond(0).unwrap();
            let text: Object = black_box(time).into();
            let time2 = text.as_datetime();
            assert!(time2.is_some());
        });
    });
}

fn bench_integer_write(c: &mut Criterion) {
    c.bench_function("integer_write", |b| {
        b.iter(|| {
            let mut buf = std::io::Cursor::new(Vec::<u8>::new());
            let mut doc = Document::new();
            doc.add_object(Object::Integer(black_box(5)));
            doc.save_to(&mut buf).unwrap();
        });
    });
}

fn bench_floating_point_write(c: &mut Criterion) {
    c.bench_function("floating_point_write", |b| {
        b.iter(|| {
            let mut buf = std::io::Cursor::new(Vec::<u8>::new());
            let mut doc = Document::new();
            doc.add_object(Object::Real(black_box(5.0)));
            doc.save_to(&mut buf).unwrap();
        });
    });
}

fn bench_boolean_write(c: &mut Criterion) {
    c.bench_function("boolean_write", |b| {
        b.iter(|| {
            let mut buf = std::io::Cursor::new(Vec::<u8>::new());
            let mut doc = Document::new();
            doc.add_object(Object::Boolean(black_box(false)));
            doc.save_to(&mut buf).unwrap();
        });
    });
}

#[cfg(feature = "chrono")]
criterion_group!(
    benches,
    create_and_parse_datetime,
    bench_integer_write,
    bench_floating_point_write,
    bench_boolean_write
);

#[cfg(not(feature = "chrono"))]
criterion_group!(
    benches,
    bench_integer_write,
    bench_floating_point_write,
    bench_boolean_write
);

criterion_main!(benches);
