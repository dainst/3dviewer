var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');

var pkg = require('./package.json');

var paths = {
	'build': 'dist/'
}

// concatenates all js files in src into a single file in build dir
gulp.task('concat-js', function() {
	return gulp.src([
			'js/three.js/**/*.js',
			'js/libs/**/*.js',
			'js/viewer.js'])
		.pipe(concat(pkg.name + '.js'))
		.pipe(gulp.dest(paths.build));
});

// minifies and concatenates js files in build dir
gulp.task('minify-js', ['concat-js'], function() {
	return gulp.src(paths.build + '/' + pkg.name + '.js')
		.pipe(uglify())
		.pipe(concat(pkg.name + '.min.js'))
    	.pipe(gulp.dest(paths.build));
});

gulp.task('default', ['minify-js']);