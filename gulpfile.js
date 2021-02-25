var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var connect = require('gulp-connect');

var pkg = require('./package.json');

var paths = {
	'build': 'dist/'
}

// starts a webserver for development
gulp.task('server', function() {
	connect.server();
});

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
gulp.task('minify-js', function() {
	return gulp.src(paths.build + '/' + pkg.name + '.js')
		.pipe(uglify())
		.pipe(concat(pkg.name + '.min.js'))
    	.pipe(gulp.dest(paths.build));
});

gulp.task('default', gulp.series('concat-js', 'minify-js'));
